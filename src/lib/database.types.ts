export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      assistant_conversations: {
        Row: {
          created_at: string
          id: string
          property_id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_args: Json | null
          tool_name: string | null
          tool_result: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          created_at: string
          id: string
          metadata: Json
          property_id: string
          summary: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          id?: string
          metadata?: Json
          property_id: string
          summary: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          id?: string
          metadata?: Json
          property_id?: string
          summary?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          code: string
          logo_url: string | null
          name: string
        }
        Insert: {
          code: string
          logo_url?: string | null
          name: string
        }
        Update: {
          code?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      clock_entries: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          hours: number
          id: string
          overtime_hours: number
          property_id: string
          source: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          hours?: number
          id?: string
          overtime_hours?: number
          property_id: string
          source?: string
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          hours?: number
          id?: string
          overtime_hours?: number
          property_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          fee_amount: number | null
          id: string
          lenco_collection_id: string | null
          line_items: Json | null
          operator: string
          owed_before: number | null
          payout_id: string | null
          phone: string
          property_id: string
          status: string
          swept_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          fee_amount?: number | null
          id?: string
          lenco_collection_id?: string | null
          line_items?: Json | null
          operator: string
          owed_before?: number | null
          payout_id?: string | null
          phone: string
          property_id: string
          status?: string
          swept_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          fee_amount?: number | null
          id?: string
          lenco_collection_id?: string | null
          line_items?: Json | null
          operator?: string
          owed_before?: number | null
          payout_id?: string | null
          phone?: string
          property_id?: string
          status?: string
          swept_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_payout_recipient: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          created_at: string
          id: boolean
          lenco_recipient_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          created_at?: string
          id?: boolean
          lenco_recipient_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          created_at?: string
          id?: boolean
          lenco_recipient_id?: string
        }
        Relationships: []
      }
      company_revenue_sweeps: {
        Row: {
          amount: number
          collection_ids: string[]
          created_at: string
          failure_reason: string | null
          id: string
          lenco_transaction_id: string | null
          payout_ids: string[]
          status: string
          subscription_payment_ids: string[]
          updated_at: string
        }
        Insert: {
          amount: number
          collection_ids?: string[]
          created_at?: string
          failure_reason?: string | null
          id?: string
          lenco_transaction_id?: string | null
          payout_ids?: string[]
          status?: string
          subscription_payment_ids?: string[]
          updated_at?: string
        }
        Update: {
          amount?: number
          collection_ids?: string[]
          created_at?: string
          failure_reason?: string | null
          id?: string
          lenco_transaction_id?: string | null
          payout_ids?: string[]
          status?: string
          subscription_payment_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          address: string | null
          allowances: Json
          bank: Json
          basic_salary: number | null
          contract_end_date: string | null
          contract_type: string
          created_at: string
          daily_rate: number | null
          date_of_birth: string | null
          days_worked: number
          deductions: Json
          dependants: number
          emergency_contact: Json
          gender: string | null
          hourly_rate: number | null
          id: string
          marital_status: string | null
          name: string
          napsa_number: string | null
          nhima_number: string | null
          notice_period_days: number | null
          nrc: string | null
          pay_type: string
          phone: string | null
          probation_months: number | null
          property_id: string
          role: string
          standard_hours_per_day: number | null
          start_date: string | null
          tpin: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          allowances?: Json
          bank?: Json
          basic_salary?: number | null
          contract_end_date?: string | null
          contract_type?: string
          created_at?: string
          daily_rate?: number | null
          date_of_birth?: string | null
          days_worked?: number
          deductions?: Json
          dependants?: number
          emergency_contact?: Json
          gender?: string | null
          hourly_rate?: number | null
          id?: string
          marital_status?: string | null
          name: string
          napsa_number?: string | null
          nhima_number?: string | null
          notice_period_days?: number | null
          nrc?: string | null
          pay_type?: string
          phone?: string | null
          probation_months?: number | null
          property_id: string
          role?: string
          standard_hours_per_day?: number | null
          start_date?: string | null
          tpin?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          allowances?: Json
          bank?: Json
          basic_salary?: number | null
          contract_end_date?: string | null
          contract_type?: string
          created_at?: string
          daily_rate?: number | null
          date_of_birth?: string | null
          days_worked?: number
          deductions?: Json
          dependants?: number
          emergency_contact?: Json
          gender?: string | null
          hourly_rate?: number | null
          id?: string
          marital_status?: string | null
          name?: string
          napsa_number?: string | null
          nhima_number?: string | null
          notice_period_days?: number | null
          nrc?: string | null
          pay_type?: string
          phone?: string | null
          probation_months?: number | null
          property_id?: string
          role?: string
          standard_hours_per_day?: number | null
          start_date?: string | null
          tpin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          property_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          property_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          id: string
          name: string
          photo_url: string | null
          property_id: string
          source: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          id?: string
          name: string
          photo_url?: string | null
          property_id: string
          source?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          property_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_config: {
        Row: {
          allocation_rule: string
          grace_period_days: number
          landlord_fee_pct: number
          landlord_id: string
          manual_approval_threshold: number | null
          penalty_cap_enabled: boolean
          penalty_cap_pct: number
          tenant_fee_pct: number
          updated_at: string
        }
        Insert: {
          allocation_rule?: string
          grace_period_days?: number
          landlord_fee_pct?: number
          landlord_id: string
          manual_approval_threshold?: number | null
          penalty_cap_enabled?: boolean
          penalty_cap_pct?: number
          tenant_fee_pct?: number
          updated_at?: string
        }
        Update: {
          allocation_rule?: string
          grace_period_days?: number
          landlord_fee_pct?: number
          landlord_id?: string
          manual_approval_threshold?: number | null
          penalty_cap_enabled?: boolean
          penalty_cap_pct?: number
          tenant_fee_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      help_articles: {
        Row: {
          created_at: string
          group_id: string
          id: string
          search_vector: unknown
          slug: string
          sort_order: number
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          search_vector?: unknown
          slug: string
          sort_order?: number
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          search_vector?: unknown
          slug?: string
          sort_order?: number
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "help_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      help_blocks: {
        Row: {
          article_id: string
          body: string
          heading: string
          id: string
          image_url: string | null
          sort_order: number
          video_url: string | null
        }
        Insert: {
          article_id: string
          body: string
          heading: string
          id?: string
          image_url?: string | null
          sort_order?: number
          video_url?: string | null
        }
        Update: {
          article_id?: string
          body?: string
          heading?: string
          id?: string
          image_url?: string | null
          sort_order?: number
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_blocks_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_groups: {
        Row: {
          created_at: string
          description: string
          icon: string | null
          id: string
          slug: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: string
          slug: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: string
          slug?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      help_sections: {
        Row: {
          body: string
          category: string
          created_at: string
          heading: string
          id: string
          image_url: string | null
          sort_order: number
          tier: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          heading: string
          id?: string
          image_url?: string | null
          sort_order?: number
          tier?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          heading?: string
          id?: string
          image_url?: string | null
          sort_order?: number
          tier?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      institutions: {
        Row: {
          created_at: string
          id: string
          name: string
          property_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          property_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_tenants: {
        Row: {
          invoice_id: string
          tenant_id: string
        }
        Insert: {
          invoice_id: string
          tenant_id: string
        }
        Update: {
          invoice_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_tenants_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          due_at: string
          id: string
          institution_id: string | null
          institution_name: string | null
          invoice_number: string
          issued_at: string
          period: string
          property_id: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          due_at: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          invoice_number: string
          issued_at?: string
          period: string
          property_id: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_at?: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          invoice_number?: string
          issued_at?: string
          period?: string
          property_id?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          affects_balance: boolean
          amount: number
          billing_period_id: string | null
          charge_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          event_type: string | null
          grace_period_end: string | null
          id: string
          idempotency_key: string | null
          label: string
          method: string | null
          origin: string | null
          paid_amount: number | null
          period: string | null
          source: string
          status: string | null
          tenant_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          affects_balance?: boolean
          amount?: number
          billing_period_id?: string | null
          charge_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          event_type?: string | null
          grace_period_end?: string | null
          id?: string
          idempotency_key?: string | null
          label: string
          method?: string | null
          origin?: string | null
          paid_amount?: number | null
          period?: string | null
          source?: string
          status?: string | null
          tenant_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          affects_balance?: boolean
          amount?: number
          billing_period_id?: string | null
          charge_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          event_type?: string | null
          grace_period_end?: string | null
          id?: string
          idempotency_key?: string | null
          label?: string
          method?: string | null
          origin?: string | null
          paid_amount?: number | null
          period?: string | null
          source?: string
          status?: string | null
          tenant_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries_legacy_archive: {
        Row: {
          archived_at: string
          id: string
          landlord_id: string
          raw: Json
          tenant_id: string
        }
        Insert: {
          archived_at?: string
          id: string
          landlord_id: string
          raw: Json
          tenant_id: string
        }
        Update: {
          archived_at?: string
          id?: string
          landlord_id?: string
          raw?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_legacy_archive_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_legacy_archive_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries_v2: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"]
          actor_id: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          billing_period: string | null
          created_at: string
          currency: string
          description: string
          direction: number
          effective_date: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          fee_rate: number | null
          id: string
          idempotency_key: string | null
          landlord_id: string
          lease_id: string | null
          legacy_raw: Json | null
          property_id: string
          reason: string | null
          reference_id: string | null
          reference_table: string | null
          signed_amount: number | null
          source: Database["public"]["Enums"]["ledger_source"]
          status: Database["public"]["Enums"]["ledger_entry_status"]
          tenant_id: string | null
          unit_id: string | null
        }
        Insert: {
          account: Database["public"]["Enums"]["ledger_account"]
          actor_id?: string | null
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          description: string
          direction: number
          effective_date: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          fee_rate?: number | null
          id?: string
          idempotency_key?: string | null
          landlord_id: string
          lease_id?: string | null
          legacy_raw?: Json | null
          property_id: string
          reason?: string | null
          reference_id?: string | null
          reference_table?: string | null
          signed_amount?: number | null
          source: Database["public"]["Enums"]["ledger_source"]
          status?: Database["public"]["Enums"]["ledger_entry_status"]
          tenant_id?: string | null
          unit_id?: string | null
        }
        Update: {
          account?: Database["public"]["Enums"]["ledger_account"]
          actor_id?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          description?: string
          direction?: number
          effective_date?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          fee_rate?: number | null
          id?: string
          idempotency_key?: string | null
          landlord_id?: string
          lease_id?: string | null
          legacy_raw?: Json | null
          property_id?: string
          reason?: string | null
          reference_id?: string | null
          reference_table?: string | null
          signed_amount?: number | null
          source?: Database["public"]["Enums"]["ledger_source"]
          status?: Database["public"]["Enums"]["ledger_entry_status"]
          tenant_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_v2_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entry_type_rules: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"]
          description_template: string
          direction: number
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Insert: {
          account: Database["public"]["Enums"]["ledger_account"]
          description_template: string
          direction: number
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Update: {
          account?: Database["public"]["Enums"]["ledger_account"]
          description_template?: string
          direction?: number
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Relationships: []
      }
      ledger_feature_flags: {
        Row: {
          allow_dev_simulate_payments: boolean
          cutover_completed_at: string | null
          enabled_at: string | null
          landlord_id: string
          ledger_v2_enabled: boolean
          notes: string | null
        }
        Insert: {
          allow_dev_simulate_payments?: boolean
          cutover_completed_at?: string | null
          enabled_at?: string | null
          landlord_id: string
          ledger_v2_enabled?: boolean
          notes?: string | null
        }
        Update: {
          allow_dev_simulate_payments?: boolean
          cutover_completed_at?: string | null
          enabled_at?: string | null
          landlord_id?: string
          ledger_v2_enabled?: boolean
          notes?: string | null
        }
        Relationships: []
      }
      ledger_v2_date_exceptions: {
        Row: {
          billing_period: string
          detected_at: string
          field: string
          id: string
          landlord_id: string
          property_id: string
          raw_value: string | null
          resolved_at: string | null
          tenant_id: string
        }
        Insert: {
          billing_period: string
          detected_at?: string
          field: string
          id?: string
          landlord_id: string
          property_id: string
          raw_value?: string | null
          resolved_at?: string | null
          tenant_id: string
        }
        Update: {
          billing_period?: string
          detected_at?: string
          field?: string
          id?: string
          landlord_id?: string
          property_id?: string
          raw_value?: string | null
          resolved_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_v2_date_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_v2_date_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          location: string
          photo_url: string | null
          photo_urls: string[]
          priority: string
          property_id: string
          resolved_at: string | null
          source: string
          status: string
          submitted_at: string
          tenant: string | null
          tenant_id: string | null
          unread: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          location: string
          photo_url?: string | null
          photo_urls?: string[]
          priority?: string
          property_id: string
          resolved_at?: string | null
          source?: string
          status?: string
          submitted_at?: string
          tenant?: string | null
          tenant_id?: string | null
          unread?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          location?: string
          photo_url?: string | null
          photo_urls?: string[]
          priority?: string
          property_id?: string
          resolved_at?: string | null
          source?: string
          status?: string
          submitted_at?: string
          tenant?: string | null
          tenant_id?: string | null
          unread?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_digest_state: {
        Row: {
          created_at: string
          digest_type: string
          id: string
          last_processed_at: string | null
          last_processed_notification_id: string | null
          last_sent_at: string | null
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          digest_type: string
          id?: string
          last_processed_at?: string | null
          last_processed_notification_id?: string | null
          last_sent_at?: string | null
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          digest_type?: string
          id?: string
          last_processed_at?: string | null
          last_processed_notification_id?: string | null
          last_sent_at?: string | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_digest_state_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          category: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          property_id: string
          read_at: string | null
          title: string
          type: string
          visible_in_feed: boolean
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          property_id: string
          read_at?: string | null
          title: string
          type: string
          visible_in_feed?: boolean
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          property_id?: string
          read_at?: string | null
          title?: string
          type?: string
          visible_in_feed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_recipients: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          lenco_recipient_id: string | null
          phone_number: string | null
          property_id: string
          provider: string | null
          type: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          lenco_recipient_id?: string | null
          phone_number?: string | null
          property_id: string
          provider?: string | null
          type?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          lenco_recipient_id?: string | null
          phone_number?: string | null
          property_id?: string
          provider?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_recipients_bank_code_fkey"
            columns: ["bank_code"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payout_recipients_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_withdrawal_otp_codes: {
        Row: {
          attempt_count: number
          code_hash: string
          confirmation_expires_at: string | null
          confirmation_token_hash: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          property_id: string
          purpose: string
          user_id: string | null
        }
        Insert: {
          attempt_count?: number
          code_hash: string
          confirmation_expires_at?: string | null
          confirmation_token_hash?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          property_id: string
          purpose?: string
          user_id?: string | null
        }
        Update: {
          attempt_count?: number
          code_hash?: string
          confirmation_expires_at?: string | null
          confirmation_token_hash?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          property_id?: string
          purpose?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_withdrawal_otp_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          fee_amount: number | null
          id: string
          lenco_transaction_id: string | null
          narration: string | null
          net_amount: number | null
          payout_recipient_id: string
          property_id: string
          requested_by: string | null
          status: string
          swept_at: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_amount?: number | null
          id?: string
          lenco_transaction_id?: string | null
          narration?: string | null
          net_amount?: number | null
          payout_recipient_id: string
          property_id: string
          requested_by?: string | null
          status?: string
          swept_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          fee_amount?: number | null
          id?: string
          lenco_transaction_id?: string | null
          narration?: string | null
          net_amount?: number | null
          payout_recipient_id?: string
          property_id?: string
          requested_by?: string | null
          status?: string
          swept_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_payout_recipient_id_fkey"
            columns: ["payout_recipient_id"]
            isOneToOne: false
            referencedRelation: "payout_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          employees_snapshot: Json
          id: string
          period: string
          prns: Json
          property_id: string
          totals: Json
        }
        Insert: {
          created_at?: string
          employees_snapshot?: Json
          id?: string
          period: string
          prns?: Json
          property_id: string
          totals?: Json
        }
        Update: {
          created_at?: string
          employees_snapshot?: Json
          id?: string
          period?: string
          prns?: Json
          property_id?: string
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_instant_sms: {
        Row: {
          created_at: string
          id: string
          notification_id: string | null
          payload: Json
          property_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id?: string | null
          payload: Json
          property_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string | null
          payload?: Json
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_instant_sms_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_instant_sms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          max_team_seats: number
          plan: string
        }
        Insert: {
          max_team_seats: number
          plan: string
        }
        Update: {
          max_team_seats?: number
          plan?: string
        }
        Relationships: []
      }
      plan_upgrade_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          property_id: string
          requested_tier: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          property_id: string
          requested_tier: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          property_id?: string
          requested_tier?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_upgrade_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_otp_codes: {
        Row: {
          attempt_count: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          property_id: string
          tenant_id: string
        }
        Insert: {
          attempt_count?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          property_id: string
          tenant_id: string
        }
        Update: {
          attempt_count?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          property_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_otp_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_otp_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_otp_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          property_id: string
          tenant_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          property_id: string
          tenant_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          property_id?: string
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          address_lat: number | null
          address_lng: number | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          name_change_count: number
          owner_id: string | null
          property_type: string | null
          slug: string | null
        }
        Insert: {
          address?: string | null
          address_lat?: number | null
          address_lng?: number | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          name_change_count?: number
          owner_id?: string | null
          property_type?: string | null
          slug?: string | null
        }
        Update: {
          address?: string | null
          address_lat?: number | null
          address_lng?: number | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          name_change_count?: number
          owner_id?: string | null
          property_type?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      property_balances: {
        Row: {
          available_balance: number
          property_id: string
          updated_at: string
        }
        Insert: {
          available_balance?: number
          property_id: string
          updated_at?: string
        }
        Update: {
          available_balance?: number
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_balances_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          billing_period_id: string
          id: string
          reminder_type: string
          sent_at: string
          tenant_id: string
        }
        Insert: {
          billing_period_id: string
          id?: string
          reminder_type: string
          sent_at?: string
          tenant_id: string
        }
        Update: {
          billing_period_id?: string
          id?: string
          reminder_type?: string
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_history: {
        Row: {
          created_at: string
          date_from: string
          date_to: string
          file_name: string
          file_path: string
          format: string
          id: string
          property_id: string
          public_token: string | null
          report_type: string
          source: string
        }
        Insert: {
          created_at?: string
          date_from: string
          date_to: string
          file_name: string
          file_path: string
          format: string
          id?: string
          property_id: string
          public_token?: string | null
          report_type: string
          source?: string
        }
        Update: {
          created_at?: string
          date_from?: string
          date_to?: string
          file_name?: string
          file_path?: string
          format?: string
          id?: string
          property_id?: string
          public_token?: string | null
          report_type?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_history_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      report_links: {
        Row: {
          breakdown: Json
          created_at: string
          date_from: string
          date_to: string
          id: string
          kind: string
          narrative: string | null
          tips: Json
          data: Json | null
          sms_sent_at: string | null
          emailed_at: string | null
          net: number
          period_label: string
          property_id: string
          public_token: string
          rent_collected: number
          total_expenses: number
        }
        Insert: {
          breakdown?: Json
          created_at?: string
          date_from: string
          date_to: string
          id?: string
          kind?: string
          narrative?: string | null
          tips?: Json
          data?: Json | null
          sms_sent_at?: string | null
          emailed_at?: string | null
          net?: number
          period_label: string
          property_id: string
          public_token?: string
          rent_collected?: number
          total_expenses?: number
        }
        Update: {
          breakdown?: Json
          created_at?: string
          date_from?: string
          date_to?: string
          id?: string
          kind?: string
          narrative?: string | null
          tips?: Json
          data?: Json | null
          sms_sent_at?: string | null
          emailed_at?: string | null
          net?: number
          period_label?: string
          property_id?: string
          public_token?: string
          rent_collected?: number
          total_expenses?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      report_link_money: {
        Row: {
          report_id: string
          data: Json
        }
        Insert: {
          report_id: string
          data?: Json
        }
        Update: {
          report_id?: string
          data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_link_money_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "report_links"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: string
        }
        Insert: {
          permission: string
          role: string
        }
        Update: {
          permission?: string
          role?: string
        }
        Relationships: []
      }
      room_types: {
        Row: {
          capacity: number
          created_at: string
          deposit_amount: number
          deposit_refundability: string
          id: string
          name: string
          property_id: string
          rent: number
        }
        Insert: {
          capacity?: number
          created_at?: string
          deposit_amount?: number
          deposit_refundability?: string
          id?: string
          name: string
          property_id: string
          rent?: number
        }
        Update: {
          capacity?: number
          created_at?: string
          deposit_amount?: number
          deposit_refundability?: string
          id?: string
          name?: string
          property_id?: string
          rent?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          number: string
          override: string | null
          property_id: string
          reserved_for_tenant_id: string | null
          room_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          number: string
          override?: string | null
          property_id: string
          reserved_for_tenant_id?: string | null
          room_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: string
          override?: string | null
          property_id?: string
          reserved_for_tenant_id?: string | null
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_reserved_for_tenant_id_fkey"
            columns: ["reserved_for_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_reserved_for_tenant_id_fkey"
            columns: ["reserved_for_tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          account_email: string | null
          account_holder_name: string | null
          account_number: string | null
          autopilot_config: Json
          autopilot_enabled: boolean
          bank_name: string | null
          billing_period: string
          collection_target_pct: number
          contact_order: string
          created_at: string
          daily_penalty_rate: number
          due_day: number
          escalation_days: number
          escalation_enabled: boolean
          grace_period_days: number
          id: string
          invoices_on: boolean
          landlord_name: string | null
          landlord_phone: string | null
          late_fee_cap_amount: number | null
          late_fee_cap_enabled: boolean
          late_fee_enabled: boolean
          late_fee_mode: string
          late_fee_percent: number
          lenco_connected: boolean
          management_fee_rate: number
          minimum_wage_reference: number
          napsa_insurable_earnings_ceiling: number
          notification_phone: string | null
          notification_prefs: Json
          onboarding: Json
          onboarding_completed: boolean
          payment_methods: Json
          payment_sms_mode: string
          payout_day: string
          pre_due_reminders_enabled: boolean
          property_id: string
          reminder_lead_days: number
          report_weekly_enabled: boolean
          report_monthly_enabled: boolean
          ops_sms_owner_copy: boolean
          payout_sms_enabled: boolean
          send_onboarding_sms: boolean
          send_payment_receipt_sms: boolean
          sms_notification_prefs: Json
          subscription_autopay: boolean
          subscription_autopay_operator: string | null
          subscription_autopay_phone: string | null
          subscription_pay_token: string
          subscription_plan: string | null
          subscription_renews_at: string | null
          task_collections_target_enabled: boolean
          task_overdue_rent_enabled: boolean
          task_stale_maintenance_enabled: boolean
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          account_holder_name?: string | null
          account_number?: string | null
          autopilot_config?: Json
          autopilot_enabled?: boolean
          bank_name?: string | null
          billing_period?: string
          collection_target_pct?: number
          contact_order?: string
          created_at?: string
          daily_penalty_rate?: number
          due_day?: number
          escalation_days?: number
          escalation_enabled?: boolean
          grace_period_days?: number
          id?: string
          invoices_on?: boolean
          landlord_name?: string | null
          landlord_phone?: string | null
          late_fee_cap_amount?: number | null
          late_fee_cap_enabled?: boolean
          late_fee_enabled?: boolean
          late_fee_mode?: string
          late_fee_percent?: number
          lenco_connected?: boolean
          management_fee_rate?: number
          minimum_wage_reference?: number
          napsa_insurable_earnings_ceiling?: number
          notification_phone?: string | null
          notification_prefs?: Json
          onboarding?: Json
          onboarding_completed?: boolean
          payment_methods?: Json
          payment_sms_mode?: string
          payout_day?: string
          pre_due_reminders_enabled?: boolean
          property_id: string
          reminder_lead_days?: number
          report_weekly_enabled?: boolean
          report_monthly_enabled?: boolean
          ops_sms_owner_copy?: boolean
          payout_sms_enabled?: boolean
          send_onboarding_sms?: boolean
          send_payment_receipt_sms?: boolean
          sms_notification_prefs?: Json
          subscription_autopay?: boolean
          subscription_autopay_operator?: string | null
          subscription_autopay_phone?: string | null
          subscription_pay_token?: string
          subscription_plan?: string | null
          subscription_renews_at?: string | null
          task_collections_target_enabled?: boolean
          task_overdue_rent_enabled?: boolean
          task_stale_maintenance_enabled?: boolean
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          account_holder_name?: string | null
          account_number?: string | null
          autopilot_config?: Json
          autopilot_enabled?: boolean
          bank_name?: string | null
          billing_period?: string
          collection_target_pct?: number
          contact_order?: string
          created_at?: string
          daily_penalty_rate?: number
          due_day?: number
          escalation_days?: number
          escalation_enabled?: boolean
          grace_period_days?: number
          id?: string
          invoices_on?: boolean
          landlord_name?: string | null
          landlord_phone?: string | null
          late_fee_cap_amount?: number | null
          late_fee_cap_enabled?: boolean
          late_fee_enabled?: boolean
          late_fee_mode?: string
          late_fee_percent?: number
          lenco_connected?: boolean
          management_fee_rate?: number
          minimum_wage_reference?: number
          napsa_insurable_earnings_ceiling?: number
          notification_phone?: string | null
          notification_prefs?: Json
          onboarding?: Json
          onboarding_completed?: boolean
          payment_methods?: Json
          payment_sms_mode?: string
          payout_day?: string
          pre_due_reminders_enabled?: boolean
          property_id?: string
          reminder_lead_days?: number
          report_weekly_enabled?: boolean
          report_monthly_enabled?: boolean
          ops_sms_owner_copy?: boolean
          payout_sms_enabled?: boolean
          send_onboarding_sms?: boolean
          send_payment_receipt_sms?: boolean
          sms_notification_prefs?: Json
          subscription_autopay?: boolean
          subscription_autopay_operator?: string | null
          subscription_autopay_phone?: string | null
          subscription_pay_token?: string
          subscription_plan?: string | null
          subscription_renews_at?: string | null
          task_collections_target_enabled?: boolean
          task_overdue_rent_enabled?: boolean
          task_stale_maintenance_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_otp_codes: {
        Row: {
          attempt_count: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          attempt_count?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
        }
        Update: {
          attempt_count?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      sms_daily_counters: {
        Row: {
          count: number
          day: string
          property_id: string
        }
        Insert: {
          count?: number
          day: string
          property_id: string
        }
        Update: {
          count?: number
          day?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_daily_counters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_send_log: {
        Row: {
          category: string
          id: string
          message: string
          property_id: string
          recipient_phone: string
          recipient_role: string | null
          sent_at: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          category: string
          id?: string
          message: string
          property_id: string
          recipient_phone: string
          recipient_role?: string | null
          sent_at?: string
          status: string
          tenant_id?: string | null
        }
        Update: {
          category?: string
          id?: string
          message?: string
          property_id?: string
          recipient_phone?: string
          recipient_role?: string | null
          sent_at?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_send_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_send_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_send_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          paid_at: string | null
          payment_method: string | null
          period: string
          property_id: string
          reminder_sent: boolean
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          period: string
          property_id: string
          reminder_sent?: boolean
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          period?: string
          property_id?: string
          reminder_sent?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          id: string
          invoice_id: string
          lenco_collection_id: string | null
          operator: string | null
          phone: string | null
          property_id: string
          status: string
          swept_at: string | null
          triggered_by: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          invoice_id: string
          lenco_collection_id?: string | null
          operator?: string | null
          phone?: string | null
          property_id: string
          status?: string
          swept_at?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          lenco_collection_id?: string | null
          operator?: string | null
          phone?: string | null
          property_id?: string
          status?: string
          swept_at?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      task_briefings: {
        Row: {
          created_at: string
          date: string
          property_id: string
          text: string
        }
        Insert: {
          created_at?: string
          date: string
          property_id: string
          text: string
        }
        Update: {
          created_at?: string
          date?: string
          property_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_briefings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          action_target_id: string | null
          action_type: string | null
          ai_title: string | null
          created_at: string
          facts: Json
          facts_hash: string
          fallback_title: string
          id: string
          key: string
          priority: string
          property_id: string
          resolved_at: string | null
          score: number
          snoozed_until: string | null
          source: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          action_target_id?: string | null
          action_type?: string | null
          ai_title?: string | null
          created_at?: string
          facts?: Json
          facts_hash: string
          fallback_title: string
          id?: string
          key: string
          priority: string
          property_id: string
          resolved_at?: string | null
          score: number
          snoozed_until?: string | null
          source?: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          action_target_id?: string | null
          action_type?: string | null
          ai_title?: string | null
          created_at?: string
          facts?: Json
          facts_hash?: string
          fallback_title?: string
          id?: string
          key?: string
          priority?: string
          property_id?: string
          resolved_at?: string | null
          score?: number
          snoozed_until?: string | null
          source?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          invited_at: string
          invited_by: string | null
          invited_email: string
          invited_phone: string | null
          notification_phone: string | null
          notification_prefs: Json
          permissions: string[]
          property_id: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_at?: string
          invited_by?: string | null
          invited_email: string
          invited_phone?: string | null
          notification_phone?: string | null
          notification_prefs?: Json
          permissions?: string[]
          property_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_at?: string
          invited_by?: string | null
          invited_email?: string
          invited_phone?: string | null
          notification_phone?: string | null
          notification_prefs?: Json
          permissions?: string[]
          property_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_path: string
          id: string
          name: string
          property_id: string
          size_bytes: number | null
          tenant_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_path: string
          id?: string
          name: string
          property_id: string
          size_bytes?: number | null
          tenant_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_path?: string
          id?: string
          name?: string
          property_id?: string
          size_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          autopilot_pause_note: string | null
          autopilot_paused_until: string | null
          created_at: string
          days_overdue: number | null
          deposit_amount: number
          deposit_date: string | null
          deposit_method: string | null
          deposit_resolution_note: string | null
          deposit_status: string
          due_day: number | null
          emergency_contacts: Json
          gender: string | null
          grace_period_days: number | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          import_batch_id: string | null
          import_batch_label: string | null
          institution_id: string | null
          move_in_date: string | null
          move_out_date: string | null
          name: string
          notes: string | null
          on_time_count: number
          onboarding_sms_sent_at: string | null
          owed_amount: number
          phone: string | null
          phones: string[]
          photo_url: string | null
          portal_token: string
          property_id: string
          rent_amount: number
          reservation_fee_amount: number | null
          reservation_fee_collected: boolean
          reservation_fee_date: string | null
          reservation_fee_method: string | null
          room_id: string | null
          room_type_id: string | null
          status: string
          total_months_count: number
          unit_label: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          autopilot_pause_note?: string | null
          autopilot_paused_until?: string | null
          created_at?: string
          days_overdue?: number | null
          deposit_amount?: number
          deposit_date?: string | null
          deposit_method?: string | null
          deposit_resolution_note?: string | null
          deposit_status?: string
          due_day?: number | null
          emergency_contacts?: Json
          gender?: string | null
          grace_period_days?: number | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          import_batch_id?: string | null
          import_batch_label?: string | null
          institution_id?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          name: string
          notes?: string | null
          on_time_count?: number
          onboarding_sms_sent_at?: string | null
          owed_amount?: number
          phone?: string | null
          phones?: string[]
          photo_url?: string | null
          portal_token?: string
          property_id: string
          rent_amount?: number
          reservation_fee_amount?: number | null
          reservation_fee_collected?: boolean
          reservation_fee_date?: string | null
          reservation_fee_method?: string | null
          room_id?: string | null
          room_type_id?: string | null
          status?: string
          total_months_count?: number
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          autopilot_pause_note?: string | null
          autopilot_paused_until?: string | null
          created_at?: string
          days_overdue?: number | null
          deposit_amount?: number
          deposit_date?: string | null
          deposit_method?: string | null
          deposit_resolution_note?: string | null
          deposit_status?: string
          due_day?: number | null
          emergency_contacts?: Json
          gender?: string | null
          grace_period_days?: number | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          import_batch_id?: string | null
          import_batch_label?: string | null
          institution_id?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          name?: string
          notes?: string | null
          on_time_count?: number
          onboarding_sms_sent_at?: string | null
          owed_amount?: number
          phone?: string | null
          phones?: string[]
          photo_url?: string | null
          portal_token?: string
          property_id?: string
          rent_amount?: number
          reservation_fee_amount?: number | null
          reservation_fee_collected?: boolean
          reservation_fee_date?: string | null
          reservation_fee_method?: string | null
          room_id?: string | null
          room_type_id?: string | null
          status?: string
          total_months_count?: number
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      arrears_aging_view: {
        Row: {
          bucket_0_7: number | null
          bucket_31_60: number | null
          bucket_60_plus: number | null
          bucket_8_30: number | null
          landlord_id: string | null
          property_id: string | null
          tenant_id: string | null
          total_overdue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_v2_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_ledger_view: {
        Row: {
          actor_id: string | null
          amount: number | null
          created_at: string | null
          description: string | null
          effective_date: string | null
          id: string | null
          landlord_id: string | null
          property_id: string | null
          reason: string | null
          reference_id: string | null
          reference_table: string | null
          signed_amount: number | null
          source: Database["public"]["Enums"]["ledger_source"] | null
          status: Database["public"]["Enums"]["ledger_entry_status"] | null
        }
        Insert: {
          actor_id?: string | null
          amount?: number | null
          created_at?: string | null
          description?: string | null
          effective_date?: string | null
          id?: string | null
          landlord_id?: string | null
          property_id?: string | null
          reason?: string | null
          reference_id?: string | null
          reference_table?: string | null
          signed_amount?: number | null
          source?: Database["public"]["Enums"]["ledger_source"] | null
          status?: Database["public"]["Enums"]["ledger_entry_status"] | null
        }
        Update: {
          actor_id?: string | null
          amount?: number | null
          created_at?: string | null
          description?: string | null
          effective_date?: string | null
          id?: string | null
          landlord_id?: string | null
          property_id?: string | null
          reason?: string | null
          reference_id?: string | null
          reference_table?: string | null
          signed_amount?: number | null
          source?: Database["public"]["Enums"]["ledger_source"] | null
          status?: Database["public"]["Enums"]["ledger_entry_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_v2_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      period_status_view: {
        Row: {
          billing_period: string | null
          landlord_id: string | null
          period_balance: number | null
          period_status: string | null
          tenant_id: string | null
          total_charged: number | null
          total_paid_or_credited: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_balance_view: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"] | null
          balance: number | null
          last_activity_date: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ledger_view: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"] | null
          actor_id: string | null
          amount: number | null
          billing_period: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          direction: number | null
          effective_date: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"] | null
          fee_rate: number | null
          id: string | null
          landlord_id: string | null
          lease_id: string | null
          property_id: string | null
          reason: string | null
          reference_id: string | null
          reference_table: string | null
          running_balance: number | null
          signed_amount: number | null
          source: Database["public"]["Enums"]["ledger_source"] | null
          status: Database["public"]["Enums"]["ledger_entry_status"] | null
          tenant_id: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_v2_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_v2_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      v_assistant_expenses: {
        Row: {
          amount: number | null
          category_name: string | null
          date: string | null
          id: string | null
          name: string | null
          property_id: string | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      v_assistant_ledger: {
        Row: {
          affects_balance: boolean | null
          amount: number | null
          created_at: string | null
          id: string | null
          label: string | null
          method: string | null
          paid_amount: number | null
          property_id: string | null
          source: string | null
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_assistant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      v_assistant_maintenance: {
        Row: {
          description: string | null
          id: string | null
          location: string | null
          property_id: string | null
          status: string | null
          submitted_at: string | null
          tenant: string | null
        }
        Insert: {
          description?: string | null
          id?: string | null
          location?: string | null
          property_id?: string | null
          status?: string | null
          submitted_at?: string | null
          tenant?: string | null
        }
        Update: {
          description?: string | null
          id?: string | null
          location?: string | null
          property_id?: string | null
          status?: string | null
          submitted_at?: string | null
          tenant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      v_assistant_rooms: {
        Row: {
          id: string | null
          number: string | null
          occupant_name: string | null
          occupant_status: string | null
          property_id: string | null
          room_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      v_assistant_tenants: {
        Row: {
          active: boolean | null
          days_overdue: number | null
          deposit_amount: number | null
          deposit_status: string | null
          emergency_contacts: Json | null
          id: string | null
          name: string | null
          phone: string | null
          phones: string[] | null
          property_id: string | null
          room: string | null
          status: string | null
          true_owed_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      allocate_payment: {
        Args: {
          p_actor_id?: string
          p_amount: number
          p_description?: string
          p_effective_date?: string
          p_event_id: string
          p_reason?: string
          p_reference_id?: string
          p_reference_table?: string
          p_source: Database["public"]["Enums"]["ledger_source"]
          p_tenant_id: string
        }
        Returns: {
          applied_to_charges: number
          credited: number
          new_balance: number
        }[]
      }
      amount_due_now: { Args: { p_tenant_id: string }; Returns: number }
      assistant_explain_tenant_balance: {
        Args: { p_tenant_id: string }
        Returns: {
          affects_balance: boolean
          days_overdue: number
          entry_amount: number
          entry_created_at: string
          entry_label: string
          entry_paid_amount: number
          entry_period: string
          entry_status: string
          name: string
          owed_amount: number
          tenant_id: string
        }[]
      }
      assistant_find_tenant: {
        Args: { p_property_id: string; p_query: string }
        Returns: {
          deposit_amount: number
          deposit_status: string
          emergency_contacts: Json
          name: string
          phone: string
          phones: string[]
          room: string
          status: string
          tenant_id: string
        }[]
      }
      assistant_get_billing_settings: {
        Args: { p_property_id: string; p_tenant_id?: string }
        Returns: {
          billing_period: string
          due_day: number
          grace_period_days: number
        }[]
      }
      assistant_get_charges: {
        Args: { p_property_id: string; p_tenant_query?: string }
        Returns: {
          amount: number
          created_at: string
          label: string
          tenant_name: string
        }[]
      }
      assistant_get_collected_rent: {
        Args: { p_property_id: string }
        Returns: {
          paid_tenant_count: number
          partial_tenant_count: number
          total_collected: number
          unpaid_tenant_count: number
        }[]
      }
      assistant_get_collected_rent_by_method: {
        Args: { p_property_id: string }
        Returns: {
          method: string
          tenant_count: number
          total: number
        }[]
      }
      assistant_get_collections_summary: {
        Args: { p_period: string; p_property_id: string }
        Returns: {
          failed_count: number
          successful_count: number
          total_collected: number
          total_fees: number
        }[]
      }
      assistant_get_current_statutory_rates: {
        Args: { p_as_of?: string }
        Returns: {
          effective_date: string
          napsa_monthly_cap: number
          napsa_rate: number
          nhima_employee_rate: number
          nhima_employer_rate: number
          notes: string | null
          paye_bands: Json
          sdl_rate: number
        }[]
      }
      assistant_get_expenses_summary: {
        Args: { p_period: string; p_property_id: string }
        Returns: {
          category_name: string
          item_count: number
          total: number
        }[]
      }
      assistant_get_invoices: {
        Args: { p_property_id: string; p_status?: string }
        Returns: {
          amount: number
          due_at: string
          institution_name: string
          invoice_id: string
          period: string
          status: string
          tenant_name: string
        }[]
      }
      assistant_get_maintenance_requests: {
        Args: { p_property_id: string; p_status?: string }
        Returns: {
          description: string
          location: string
          request_id: string
          status: string
          submitted_at: string
          tenant_name: string
        }[]
      }
      assistant_get_overdue_tenants: {
        Args: { p_property_id: string }
        Returns: {
          days_overdue: number
          name: string
          owed_amount: number
          phone: string
          tenant_id: string
        }[]
      }
      assistant_get_paid_tenants: {
        Args: { p_property_id: string }
        Returns: {
          emergency_contacts: Json
          name: string
          phone: string
          phones: string[]
          room: string
          tenant_id: string
        }[]
      }
      assistant_get_partial_tenants: {
        Args: { p_property_id: string }
        Returns: {
          last_paid_amount: number
          name: string
          owed_amount: number
          phone: string
          tenant_id: string
        }[]
      }
      assistant_get_payments: {
        Args: { p_date?: string; p_method?: string; p_property_id: string }
        Returns: {
          amount: number
          created_at: string
          method: string
          source: string
          tenant_name: string
        }[]
      }
      assistant_get_payouts_summary: {
        Args: { p_property_id: string }
        Returns: {
          available_balance: number
          recent_payouts: Json
        }[]
      }
      assistant_get_room_occupant: {
        Args: { p_property_id: string; p_room_query: string }
        Returns: {
          owed_amount: number
          room_number: string
          room_type: string
          tenant_name: string
          tenant_status: string
        }[]
      }
      assistant_get_room_types_summary: {
        Args: { p_property_id: string }
        Returns: {
          occupied_rooms: number
          room_type: string
          total_rooms: number
          vacant_rooms: number
        }[]
      }
      assistant_get_vacancy_summary: {
        Args: { p_property_id: string }
        Returns: {
          occupied_rooms: number
          total_rooms: number
          vacant_rooms: number
        }[]
      }
      assistant_query: {
        Args: {
          p_filters?: Json
          p_limit?: number
          p_property_id: string
          p_view: string
        }
        Returns: Json
      }
      calculate_tenant_balance: {
        Args: { p_tenant_id: string }
        Returns: {
          balance: number
          total_adjustments: number
          total_charges: number
          total_payments: number
          total_penalties: number
        }[]
      }
      charge_has_active_linked_events: {
        Args: { p_charge_id: string }
        Returns: boolean
      }
      detect_collections_below_target: {
        Args: { p_property_id: string }
        Returns: {
          action_target_id: string
          action_type: string
          facts: Json
          fallback_title: string
          key: string
          score: number
          type: string
        }[]
      }
      detect_overdue_rent: {
        Args: { p_property_id: string }
        Returns: {
          action_target_id: string
          action_type: string
          facts: Json
          fallback_title: string
          key: string
          score: number
          type: string
        }[]
      }
      detect_stale_maintenance: {
        Args: { p_property_id: string }
        Returns: {
          action_target_id: string
          action_type: string
          facts: Json
          fallback_title: string
          key: string
          score: number
          type: string
        }[]
      }
      fee_config_for_landlord: {
        Args: { p_landlord_id: string }
        Returns: {
          allocation_rule: string
          grace_period_days: number
          landlord_fee_pct: number
          landlord_id: string
          manual_approval_threshold: number | null
          penalty_cap_enabled: boolean
          penalty_cap_pct: number
          tenant_fee_pct: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fee_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_auth_user_id: { Args: { p_email: string }; Returns: string }
      generate_portal_token: { Args: never; Returns: string }
      generate_settings_pay_token: { Args: never; Returns: string }
      get_all_open_tasks: { Args: { p_property_id: string }; Returns: Json }
      get_property_settings_safe: {
        Args: { p_property: string }
        Returns: Json
      }
      get_today_tasks: { Args: { p_property_id: string }; Returns: Json }
      import_tenant_opening_balance: {
        Args: { p_owing: number; p_tenant_id: string }
        Returns: undefined
      }
      increment_sms_daily_counter: {
        Args: { p_day: string; p_property_id: string }
        Returns: number
      }
      ledger_entry_is_prepaid_hold: {
        Args: {
          p_billing_period_id: string
          p_charge_id: string
          p_event_type: string
        }
        Returns: boolean
      }
      ledger_period_from_label: { Args: { p_label: string }; Returns: string }
      ledger_v2_available_cash: {
        Args: { p_property_id: string }
        Returns: number
      }
      ledger_v2_caller_role: {
        Args: { p_property_id: string }
        Returns: string
      }
      ledger_v2_charge_remaining: {
        Args: { p_charge_id: string }
        Returns: number
      }
      ledger_v2_reclaim_stuck_payouts: {
        Args: { p_max_age_minutes?: number }
        Returns: {
          reclaimed_entry_id: string
          reversal_entry_id: string
        }[]
      }
      ledger_v2_requires_approval: {
        Args: {
          p_amount: number
          p_caller_role: string
          p_fee_config: Database["public"]["Tables"]["fee_config"]["Row"]
        }
        Returns: boolean
      }
      ledger_v2_run_daily_penalty_accrual: {
        Args: never
        Returns: {
          entries_posted: number
          error: string
          tenant_id: string
          total_amount: number
        }[]
      }
      ledger_v2_safe_date: { Args: { p_text: string }; Returns: string }
      ledger_v2_tenant_balance: {
        Args: {
          p_account: Database["public"]["Enums"]["ledger_account"]
          p_tenant_id: string
        }
        Returns: number
      }
      ledger_v2_tenant_context: {
        Args: { p_tenant_id: string }
        Returns: {
          caller_role: string
          landlord_id: string
          property_id: string
        }[]
      }
      ledger_v2_verify: {
        Args: { p_landlord_id: string }
        Returns: {
          check_name: string
          failing_count: number
        }[]
      }
      lusaka_current_period: { Args: never; Returns: string }
      my_access: {
        Args: never
        Returns: {
          is_owner: boolean
          permissions: string[]
          property_id: string
          property_name: string
          role: string
          status: string
        }[]
      }
      pay_portal_claim_payout_collections: {
        Args: {
          p_max_amount?: number
          p_payout_id: string
          p_property_id: string
        }
        Returns: number
      }
      pay_portal_get_balance_v2: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: number
      }
      pay_portal_get_collection_status: {
        Args: {
          p_collection_id: string
          p_session_token: string
          p_tenant_id: string
        }
        Returns: {
          failure_reason: string
          status: string
        }[]
      }
      pay_portal_get_ledger: {
        Args: { p_tenant_id: string }
        Returns: {
          amount: number
          label: string
          paid_amount: number
          status: string
        }[]
      }
      pay_portal_get_ledger_v2: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: {
          amount: number
          created_at: string
          label: string
          paid_amount: number
          status: string
        }[]
      }
      pay_portal_get_maintenance_v1: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: {
          description: string
          id: string
          location: string
          photo_urls: string[]
          status: string
          submitted_at: string
        }[]
      }
      pay_portal_get_property: {
        Args: { p_property_slug: string }
        Returns: {
          due_day: number
          id: string
          logo_url: string
          name: string
        }[]
      }
      pay_portal_get_property_balance: {
        Args: { p_property_id: string }
        Returns: number
      }
      pay_portal_get_property_v2: {
        Args: { p_property_slug: string }
        Returns: {
          daily_penalty_rate: number
          due_day: number
          grace_period_days: number
          id: string
          late_fee_cap_amount: number
          late_fee_cap_enabled: boolean
          late_fee_enabled: boolean
          late_fee_mode: string
          late_fee_percent: number
          logo_url: string
          name: string
        }[]
      }
      pay_portal_get_statement_v2: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: {
          amount: number
          description: string
          direction: number
          effective_date: string
          entry_type: string
          running_balance: number
          status: string
        }[]
      }
      pay_portal_get_tenant: {
        Args: { p_property_slug: string; p_tenant_id: string }
        Returns: {
          days_overdue: number
          id: string
          name: string
          owed_amount: number
          rent_amount: number
          room: string
          room_type: string
          status: string
        }[]
      }
      pay_portal_get_tenant_v2: {
        Args: {
          p_property_slug: string
          p_session_token: string
          p_tenant_id: string
        }
        Returns: {
          days_overdue: number
          emergency_contacts: Json
          id: string
          landlord_name: string
          move_in_date: string
          name: string
          owed_amount: number
          phone: string
          property_address: string
          property_name: string
          rent_amount: number
          room: string
          room_type: string
          status: string
        }[]
      }
      pay_portal_has_ledger_penalty: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: boolean
      }
      pay_portal_increment_property_balance: {
        Args: { p_amount: number; p_property_id: string }
        Returns: undefined
      }
      pay_portal_log_payment_v2: {
        Args: {
          p_amount: number
          p_label: string
          p_session_token: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      pay_portal_release_payout_collections: {
        Args: { p_payout_id: string }
        Returns: undefined
      }
      pay_portal_search_tenants: {
        Args: { p_property_slug: string }
        Returns: {
          id: string
          name: string
          owed_amount: number
          room: string
        }[]
      }
      pay_portal_search_tenants_v2: {
        Args: { p_property_slug: string }
        Returns: {
          id: string
          name: string
          room: string
        }[]
      }
      pay_portal_submit_maintenance_report: {
        Args: {
          p_description: string
          p_photo_url: string
          p_property_slug: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      pay_portal_submit_maintenance_report_v2: {
        Args: {
          p_description: string
          p_location: string
          p_photo_urls?: string[]
          p_property_slug: string
          p_session_token: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      pay_portal_verify_session: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: boolean
      }
      post_charge: {
        Args: {
          p_amount: number
          p_billing_period?: string
          p_description: string
          p_effective_date?: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: {
          entry_id: string
          new_balance: number
          status: Database["public"]["Enums"]["ledger_entry_status"]
        }[]
      }
      post_credit: {
        Args: {
          p_amount: number
          p_description?: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: {
          entry_id: string
          new_balance: number
          status: Database["public"]["Enums"]["ledger_entry_status"]
        }[]
      }
      post_daily_sms_summary: { Args: never; Returns: undefined }
      post_deposit_action: {
        Args: {
          p_amount: number
          p_description?: string
          p_entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          p_reason: string
          p_tenant_id: string
        }
        Returns: {
          entry_id: string
          new_deposit_balance: number
          status: Database["public"]["Enums"]["ledger_entry_status"]
        }[]
      }
      post_payment: {
        Args: {
          p_effective_date?: string
          p_event_id: string
          p_reference_id?: string
          p_reference_table?: string
          p_rent_amount: number
          p_source?: Database["public"]["Enums"]["ledger_source"]
          p_tenant_id: string
        }
        Returns: {
          already_processed: boolean
          applied_to_charges: number
          credited: number
          new_balance: number
        }[]
      }
      post_payout: {
        Args: {
          p_amount: number
          p_payout_id: string
          p_property_id: string
          p_reason?: string
        }
        Returns: {
          available_before: number
          entry_id: string
        }[]
      }
      post_penalty_accrual: {
        Args: { p_as_of_date?: string; p_tenant_id: string }
        Returns: {
          entries_posted: number
          total_amount: number
        }[]
      }
      post_rent_charges: {
        Args: { p_billing_period: string; p_tenant_id: string }
        Returns: {
          already_posted: boolean
          amount: number
          entry_id: string
        }[]
      }
      property_people: {
        Args: { p_property: string }
        Returns: {
          full_name: string
          role: string
          status: string
          user_id: string
        }[]
      }
      record_offline_payment: {
        Args: {
          p_amount: number
          p_description?: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: {
          applied_to_charges: number
          credited: number
          new_balance: number
        }[]
      }
      reverse_entry: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: {
          entry_id: string
          new_balance: number
        }[]
      }
      search_help_articles: {
        Args: { q: string }
        Returns: {
          article_id: string
          article_slug: string
          group_slug: string
          group_title: string
          rank: number
          snippet: string
          summary: string
          title: string
        }[]
      }
      set_task_status: {
        Args: { p_snooze_days?: number; p_status: string; p_task_id: string }
        Returns: Json
      }
      sms_phone_key: { Args: { p: string }; Returns: string }
      sync_all_tasks: { Args: never; Returns: number }
      sync_tasks: { Args: { p_property_id: string }; Returns: number }
      sync_tenant_balance_if_new_model: {
        Args: { p_tenant_id: string }
        Returns: {
          balance: number
          days_overdue: number
          skip_reason: string
          status: string
          synchronized: boolean
          tenant_id: string
        }[]
      }
      task_kwacha: { Args: { amount: number }; Returns: string }
      task_priority: { Args: { p_score: number }; Returns: string }
      tenant_has_moved_in: { Args: { p_move_in: string }; Returns: boolean }
      void_ledger_entry: {
        Args: { p_id: string; p_reason: string }
        Returns: {
          entry_id: string
          refusal_reason: string
          voided: boolean
        }[]
      }
      waive_charge: {
        Args: { p_amount?: number; p_charge_id: string; p_reason: string }
        Returns: {
          entry_id: string
          new_balance: number
          status: Database["public"]["Enums"]["ledger_entry_status"]
        }[]
      }
    }
    Enums: {
      ledger_account: "RENT" | "DEPOSIT" | "FEES" | "PAYOUT"
      ledger_entry_status: "POSTED" | "PENDING_APPROVAL" | "REJECTED"
      ledger_entry_type:
        | "RENT_CHARGE"
        | "PENALTY_CHARGE"
        | "ADDED_CHARGE"
        | "PAYMENT"
        | "WAIVER"
        | "CREDIT"
        | "REFUND"
        | "REVERSAL"
        | "DEPOSIT_RECEIVED"
        | "DEPOSIT_DEDUCTION"
        | "DEPOSIT_REFUND"
        | "DEPOSIT_FORFEIT"
        | "TENANT_FEE"
        | "PLATFORM_FEE"
        | "LENCO_COST"
        | "PAYOUT"
        | "OPENING_BALANCE"
      ledger_source:
        | "AUTO_SCHEDULER"
        | "AUTO_WEBHOOK"
        | "AUTO_PENALTY"
        | "MANUAL"
        | "MIGRATION"
        | "SYSTEM"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ledger_account: ["RENT", "DEPOSIT", "FEES", "PAYOUT"],
      ledger_entry_status: ["POSTED", "PENDING_APPROVAL", "REJECTED"],
      ledger_entry_type: [
        "RENT_CHARGE",
        "PENALTY_CHARGE",
        "ADDED_CHARGE",
        "PAYMENT",
        "WAIVER",
        "CREDIT",
        "REFUND",
        "REVERSAL",
        "DEPOSIT_RECEIVED",
        "DEPOSIT_DEDUCTION",
        "DEPOSIT_REFUND",
        "DEPOSIT_FORFEIT",
        "TENANT_FEE",
        "PLATFORM_FEE",
        "LENCO_COST",
        "PAYOUT",
        "OPENING_BALANCE",
      ],
      ledger_source: [
        "AUTO_SCHEDULER",
        "AUTO_WEBHOOK",
        "AUTO_PENALTY",
        "MANUAL",
        "MIGRATION",
        "SYSTEM",
      ],
    },
  },
} as const
