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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
          id: string
          lenco_collection_id: string | null
          operator: string
          phone: string
          property_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          lenco_collection_id?: string | null
          operator: string
          phone: string
          property_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          lenco_collection_id?: string | null
          operator?: string
          phone?: string
          property_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
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
        ]
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
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          created_at: string
          id: string
          label: string
          method: string | null
          paid_amount: number | null
          period: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          label: string
          method?: string | null
          paid_amount?: number | null
          period?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          label?: string
          method?: string | null
          paid_amount?: number | null
          period?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          property_id: string
          resolved_at: string | null
          status: string
          submitted_at: string
          tenant: string | null
          unread: boolean
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          location: string
          photo_url?: string | null
          photo_urls?: string[]
          property_id: string
          resolved_at?: string | null
          status?: string
          submitted_at?: string
          tenant?: string | null
          unread?: boolean
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          location?: string
          photo_url?: string | null
          photo_urls?: string[]
          property_id?: string
          resolved_at?: string | null
          status?: string
          submitted_at?: string
          tenant?: string | null
          unread?: boolean
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
      payout_recipients: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          created_at: string
          id: string
          lenco_recipient_id: string
          property_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          created_at?: string
          id?: string
          lenco_recipient_id: string
          property_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          created_at?: string
          id?: string
          lenco_recipient_id?: string
          property_id?: string
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
      payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          lenco_transaction_id: string | null
          narration: string | null
          payout_recipient_id: string
          property_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          lenco_transaction_id?: string | null
          narration?: string | null
          payout_recipient_id: string
          property_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          lenco_transaction_id?: string | null
          narration?: string | null
          payout_recipient_id?: string
          property_id?: string
          status?: string
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
      properties: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          owner_id: string | null
          property_type: string | null
          slug: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          property_type?: string | null
          slug?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          property_type?: string | null
          slug?: string | null
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
          room_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          number: string
          override?: string | null
          property_id: string
          room_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: string
          override?: string | null
          property_id?: string
          room_type_id?: string
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
          bank_name: string | null
          billing_period: string
          collection_target_pct: number
          contact_order: string
          created_at: string
          daily_penalty_rate: number
          due_day: number
          escalation_days: number
          grace_period_days: number
          id: string
          invoices_on: boolean
          landlord_name: string | null
          landlord_phone: string | null
          lenco_connected: boolean
          management_fee_rate: number
          minimum_wage_reference: number
          napsa_insurable_earnings_ceiling: number
          notification_prefs: Json
          onboarding_completed: boolean
          payment_methods: Json
          payout_day: string | null
          property_id: string
          reminder_lead_days: number
          subscription_plan: string | null
          subscription_renews_at: string | null
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          account_holder_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          billing_period?: string
          collection_target_pct?: number
          contact_order?: string
          created_at?: string
          daily_penalty_rate?: number
          due_day?: number
          escalation_days?: number
          grace_period_days?: number
          id?: string
          invoices_on?: boolean
          landlord_name?: string | null
          landlord_phone?: string | null
          lenco_connected?: boolean
          management_fee_rate?: number
          minimum_wage_reference?: number
          napsa_insurable_earnings_ceiling?: number
          notification_prefs?: Json
          onboarding_completed?: boolean
          payment_methods?: Json
          payout_day?: string | null
          property_id: string
          reminder_lead_days?: number
          subscription_plan?: string | null
          subscription_renews_at?: string | null
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          account_holder_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          billing_period?: string
          collection_target_pct?: number
          contact_order?: string
          created_at?: string
          daily_penalty_rate?: number
          due_day?: number
          escalation_days?: number
          grace_period_days?: number
          id?: string
          invoices_on?: boolean
          landlord_name?: string | null
          landlord_phone?: string | null
          lenco_connected?: boolean
          management_fee_rate?: number
          minimum_wage_reference?: number
          napsa_insurable_earnings_ceiling?: number
          notification_prefs?: Json
          onboarding_completed?: boolean
          payment_methods?: Json
          payout_day?: string | null
          property_id?: string
          reminder_lead_days?: number
          subscription_plan?: string | null
          subscription_renews_at?: string | null
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
      tenants: {
        Row: {
          active: boolean
          created_at: string
          days_overdue: number | null
          deposit_amount: number
          deposit_date: string | null
          deposit_method: string | null
          deposit_resolution_note: string | null
          deposit_status: string
          emergency_contacts: Json
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          institution_id: string | null
          move_in_date: string | null
          move_out_date: string | null
          name: string
          notes: string | null
          on_time_count: number
          owed_amount: number
          phone: string | null
          phones: string[]
          property_id: string
          rent_amount: number
          room_id: string | null
          room_type_id: string | null
          status: string
          total_months_count: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_overdue?: number | null
          deposit_amount?: number
          deposit_date?: string | null
          deposit_method?: string | null
          deposit_resolution_note?: string | null
          deposit_status?: string
          emergency_contacts?: Json
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          institution_id?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          name: string
          notes?: string | null
          on_time_count?: number
          owed_amount?: number
          phone?: string | null
          phones?: string[]
          property_id: string
          rent_amount?: number
          room_id?: string | null
          room_type_id?: string | null
          status?: string
          total_months_count?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          days_overdue?: number | null
          deposit_amount?: number
          deposit_date?: string | null
          deposit_method?: string | null
          deposit_resolution_note?: string | null
          deposit_status?: string
          emergency_contacts?: Json
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          institution_id?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          name?: string
          notes?: string | null
          on_time_count?: number
          owed_amount?: number
          phone?: string | null
          phones?: string[]
          property_id?: string
          rent_amount?: number
          room_id?: string | null
          room_type_id?: string | null
          status?: string
          total_months_count?: number
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
      [_ in never]: never
    }
    Functions: {
      pay_portal_get_ledger: {
        Args: { p_tenant_id: string }
        Returns: {
          amount: number
          label: string
          paid_amount: number
          status: string
        }[]
      }
      pay_portal_get_collection_status: {
        Args: { p_collection_id: string; p_session_token: string; p_tenant_id: string }
        Returns: {
          failure_reason: string
          status: string
        }[]
      }
      pay_portal_get_ledger_v2: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: {
          amount: number
          label: string
          paid_amount: number
          status: string
        }[]
      }
      pay_portal_get_property: {
        Args: { p_property_slug: string }
        Returns: {
          id: string
          name: string
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
        Args: { p_property_slug: string; p_session_token: string; p_tenant_id: string }
        Returns: {
          days_overdue: number
          id: string
          name: string
          owed_amount: number
          phone: string
          rent_amount: number
          room: string
          room_type: string
          status: string
        }[]
      }
      pay_portal_log_payment: {
        Args: { p_amount: number; p_label: string; p_tenant_id: string }
        Returns: undefined
      }
      pay_portal_log_payment_v2: {
        Args: { p_amount: number; p_label: string; p_session_token: string; p_tenant_id: string }
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
          p_tenant_id: string
        }
        Returns: undefined
      }
      pay_portal_verify_session: {
        Args: { p_session_token: string; p_tenant_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
