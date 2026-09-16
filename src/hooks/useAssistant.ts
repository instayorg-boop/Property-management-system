import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../landlord/SettingsContext";
import {
  appendMessage,
  createConversation,
  listConversations,
  listMessages,
  sendAssistantMessage,
  setConversationTitle,
} from "../lib/assistantApi";
import type { AssistantConversation, AssistantTurn } from "../types/assistant";

const MAX_TITLE_LENGTH = 60;

/** A conversation's title from its opening prompt — same idea as how a browser tab or a chat app
 * names a thread after what it was actually about, truncated so it stays a one-line label in the
 * history list rather than wrapping. */
function titleFromPrompt(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_TITLE_LENGTH ? `${oneLine.slice(0, MAX_TITLE_LENGTH).trimEnd()}…` : oneLine;
}

// Which conversation is "active" survives a reload/navigation the same way the tenant portal's
// own session does — a plain localStorage key, one per property (a landlord can only be looking
// at one property's assistant at a time, but this still keys by it for correctness across a
// property switch).
const activeConversationKey = (propertyId: string) => `instay-assistant-active:${propertyId}`;

function readStoredActiveId(propertyId: string): string | null {
  try {
    return localStorage.getItem(activeConversationKey(propertyId));
  } catch {
    return null;
  }
}

function writeStoredActiveId(propertyId: string, id: string | null) {
  try {
    if (id) localStorage.setItem(activeConversationKey(propertyId), id);
    else localStorage.removeItem(activeConversationKey(propertyId));
  } catch {
    // localStorage unavailable — the active conversation just won't survive a reload this
    // session, not worth failing anything over.
  }
}

/** Drives one assistant conversation, plus the ability to switch between past ones. Read-only by
 * design — `send` only ever logs the prompt and displays whatever the edge function answers; it
 * never writes to any tenant/property record itself (that's the edge function's job to refuse,
 * per its system prompt — see supabase/functions/assistant-chat).
 *
 * Conversation lifecycle — four states, only two of which are ever visible as separate things:
 *  - draft:      conversationId === null. No assistant_conversations row exists. This is what
 *                mounting fresh, reloading with nothing stored, or hitting "New chat" all land on.
 *                A draft is created for free (no DB write) and there's only ever one at a time —
 *                nothing to "reuse" a second one of, because a draft is never persisted until it
 *                actually has a message in it (see send()). This is what fixes the old bug where
 *                mounting the panel — or clicking "New chat" repeatedly — created a fresh empty
 *                conversation row every single time.
 *  - persisted:  the moment send() is first called against a draft, createConversation() runs and
 *                conversationId flips to a real id. From here on this conversation is exactly like
 *                any other past one — it shows up in `conversations`, is switchable, has a title.
 *  - active:     whichever conversation conversationId currently points at (draft or persisted) —
 *                this is what's rendered. Persisted to localStorage on every change so a reload or
 *                navigating away and back resumes the same thread instead of losing it.
 *  - history:    every other persisted conversation, listed in `conversations`, reachable via
 *                switchConversation.
 */
export function useAssistant(tenantId?: string) {
  const { propertyId } = useSettings();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against StrictMode's double-invoke / a re-render before propertyId settles from
  // resuming/creating twice for the same panel session.
  const startedFor = useRef<string | null>(null);
  // Mirrors conversationId synchronously (state alone is stale inside an in-flight send()'s
  // closure) — checked when a reply/error comes back so it only ever lands in the transcript of
  // the conversation that actually asked for it, never whatever happens to be active by then.
  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const refreshConversations = useCallback((pid: string) => {
    listConversations(pid)
      .then(setConversations)
      .catch((e) => console.error("Failed to load assistant conversation history", e));
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const rows = await listMessages(id);
    setConversationId(id);
    setTurns(
      rows
        .filter((r): r is typeof r & { role: "user" | "assistant" } => r.role === "user" || r.role === "assistant")
        .map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.createdAt }))
    );
  }, []);

  // On first mount for this property: resume whichever conversation was last active (survives a
  // reload or navigating to a different page and back), or land on a fresh draft if there's
  // nothing stored, or it no longer exists. Never creates a conversation row just from mounting.
  useEffect(() => {
    if (!propertyId || startedFor.current === propertyId) return;
    startedFor.current = propertyId;
    refreshConversations(propertyId);
    const storedId = readStoredActiveId(propertyId);
    if (!storedId) return;
    setIsSwitching(true);
    loadConversation(storedId)
      .catch(() => {
        // Stale/deleted conversation — silently fall back to a draft rather than surfacing an
        // error for something the landlord never asked to open this session.
        writeStoredActiveId(propertyId, null);
      })
      .finally(() => setIsSwitching(false));
  }, [propertyId, refreshConversations, loadConversation]);

  /** Back to a blank draft — reuses the one always-available draft slot rather than creating
   * another empty conversation row (a conversation is never persisted until it actually has a
   * message in it — see send()), so there's nothing for repeated "New chat" clicks to pile up. */
  const startNewConversation = useCallback(() => {
    if (conversationId === null && turns.length === 0) return; // already an untouched draft
    setError(null);
    setConversationId(null);
    setTurns([]);
    if (propertyId) writeStoredActiveId(propertyId, null);
  }, [conversationId, turns.length, propertyId]);

  /** Loads a past thread's messages back in — only user/assistant rows render as turns; a logged
   * tool call has no turn of its own in this UI (see AssistantMessage's role union). */
  const switchConversation = useCallback(
    async (id: string) => {
      if (id === conversationId) return;
      setError(null);
      setIsSwitching(true);
      try {
        await loadConversation(id);
        if (propertyId) writeStoredActiveId(propertyId, id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't open that conversation.");
      } finally {
        setIsSwitching(false);
      }
    },
    [conversationId, propertyId, loadConversation]
  );

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || !propertyId || isStreaming) return;

      setError(null);

      // A draft becomes a real, persisted conversation the moment it actually has something in
      // it — this is the one and only place a conversation row gets created.
      let activeId = conversationId;
      const isNewConversation = activeId === null;
      if (isNewConversation) {
        try {
          const conv = await createConversation(propertyId);
          activeId = conv.id;
          setConversationId(conv.id);
          setConversations((prev) => [conv, ...prev]);
          writeStoredActiveId(propertyId, conv.id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't start a conversation.");
          return;
        }
      }
      const requestConversationId = activeId;

      setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed, createdAt: new Date().toISOString() }]);
      setIsStreaming(true);
      try {
        // Logging the prompt and asking the model for an answer don't depend on each other — the
        // prompt goes to the edge function directly in the request body, not by it re-reading this
        // row back from the table — so run them together instead of waiting out a whole extra
        // network round trip for the log write before the (much slower) model call even starts.
        const [, answer] = await Promise.all([
          appendMessage(requestConversationId, "user", trimmed),
          sendAssistantMessage(requestConversationId, propertyId, trimmed, tenantId ? { tenantId } : undefined),
        ]);
        if (isNewConversation) {
          const title = titleFromPrompt(trimmed);
          void setConversationTitle(requestConversationId, title)
            .then((updated) => setConversations((prev) => [updated, ...prev.filter((c) => c.id !== updated.id)]))
            .catch((e) => console.error("Failed to title conversation", e));
        }
        // The landlord may have switched to a different conversation (or reset to a fresh draft)
        // while this was in flight — the reply is already safely logged server-side either way
        // (the edge function writes it to assistant_messages itself), so only paint it into the
        // visible transcript if we're still looking at the conversation that actually asked.
        if (conversationIdRef.current === requestConversationId) {
          setTurns((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: answer, createdAt: new Date().toISOString() }]);
        }
      } catch (e) {
        if (conversationIdRef.current === requestConversationId) {
          setError(e instanceof Error ? e.message : "Something went wrong — try again.");
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [conversationId, propertyId, tenantId, isStreaming]
  );

  return { turns, send, isStreaming, error, conversationId, conversations, startNewConversation, switchConversation, isSwitching };
}
