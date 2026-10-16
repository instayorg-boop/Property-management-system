import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

// Turns the on-screen report preview into the downloaded PDF, so the file looks exactly like what
// the landlord just saw. The preview is laid out at A4 width off-screen, captured, then cut into
// pages between table rows (never through one), with a page number at the bottom of each page.

const PAGE_W = 794; // A4 at 96 dpi
const PAGE_H = 1123;
const MARGIN_Y = 40;
const MARGIN_X = 40;
const CONTENT_H = PAGE_H - MARGIN_Y * 2 - 20; // room for the page number

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  ).then(() => undefined);
}

export async function downloadElementAsPdf(source: HTMLElement, fileName: string): Promise<void> {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W - MARGIN_X * 2}px;background:#ffffff;color:#1a1a1a;`;
  const clone = source.cloneNode(true) as HTMLElement;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    await waitForImages(wrapper);
    if (document.fonts?.ready) await document.fonts.ready;

    // Safe places to cut a page: the bottom of every table row and every top-level block.
    const top = wrapper.getBoundingClientRect().top;
    const cuts = new Set<number>();
    wrapper.querySelectorAll("tr, thead, table, h1, h2, p, .pdf-block").forEach((el) => {
      cuts.add(Math.round((el as HTMLElement).getBoundingClientRect().bottom - top));
    });
    const sortedCuts = Array.from(cuts).sort((a, b) => a - b);
    const totalH = Math.ceil(wrapper.scrollHeight);

    const scale = 2;
    // The wrapper's inline `position:fixed; left:-10000px` is copied onto the snapshot too, which
    // would draw the whole report 10,000px off the canvas and leave every page blank. Reset it on
    // the captured copy only; the live wrapper stays hidden off-screen.
    const canvas = await toCanvas(wrapper, {
      pixelRatio: scale,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: wrapper.offsetWidth,
      height: totalH,
      style: { position: "static", left: "0", top: "0", margin: "0" },
    });

    const pages: [number, number][] = [];
    let start = 0;
    while (start < totalH - 1) {
      const limit = start + CONTENT_H;
      let end = totalH;
      if (limit < totalH) {
        const fit = sortedCuts.filter((c) => c > start + 100 && c <= limit);
        end = fit.length ? fit[fit.length - 1] : limit;
      }
      pages.push([start, end]);
      start = end;
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [PAGE_W, PAGE_H], hotfixes: ["px_scaling"] });
    pages.forEach(([s, e], i) => {
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H], "portrait");
      const h = e - s;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.round(h * scale);
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, Math.round(s * scale), canvas.width, Math.round(h * scale), 0, 0, slice.width, slice.height);
      pdf.addImage(slice.toDataURL("image/png"), "PNG", MARGIN_X, MARGIN_Y, PAGE_W - MARGIN_X * 2, h, undefined, "FAST");
      pdf.setFontSize(9);
      pdf.setTextColor(140, 140, 140);
      pdf.text(`Page ${i + 1} of ${pages.length}`, PAGE_W / 2, PAGE_H - 22, { align: "center" });
    });
    pdf.save(fileName);
  } finally {
    wrapper.remove();
  }
}
