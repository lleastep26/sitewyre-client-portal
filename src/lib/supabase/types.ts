export type MembershipRole = "owner" | "office" | "crew" | "sitewyre_admin";

export type ClientRow = {
  id: string;
  user_id: string | null;
  business_name: string | null;
  domain: string | null;
  live_site_url: string | null;
  phone: string | null;
  trade: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  google_review_url: string | null;
  site_key: string | null;
  timezone: string | null;
  brand_colors: Record<string, string> | null;
  service_area: string | null;
  plan: string | null;
  status: string | null;
  twilio_phone_number: string | null;
  twilio_phone_sid: string | null;
  a2p_status: string | null;
  stripe_connect_account_id: string | null;
  setup_checklist: Record<string, boolean> | null;
  created_at: string;
  updated_at: string | null;
};

export type MembershipRow = {
  id: string;
  user_id: string;
  client_id: string;
  role: MembershipRole;
  created_at: string;
};

export type ContactRow = {
  id: string;
  client_id: string;
  name: string;
  phones: string[];
  emails: string[];
  address: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  sms_opt_in: boolean;
  email_opt_in: boolean;
  created_at: string;
  updated_at: string | null;
};

export type PipelineStageRow = {
  id: string;
  client_id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type LeadRow = {
  id: string;
  client_id: string;
  contact_id: string | null;
  stage_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  service: string | null;
  value: number | null;
  source: string | null;
  owner_id: string | null;
  lost_reason: string | null;
  last_activity_at: string | null;
  first_response_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ActivityRow = {
  id: string;
  client_id: string;
  contact_id: string;
  type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type MessageRow = {
  id: string;
  client_id: string;
  contact_id: string;
  channel: "sms" | "email" | "call" | "note";
  direction: "inbound" | "outbound" | "internal";
  body: string | null;
  media: unknown;
  status: string | null;
  external_id: string | null;
  created_at: string;
};

export type ServiceRow = {
  id: string;
  client_id: string;
  name: string;
  duration_minutes: number;
  default_price: number | null;
  bookable_online: boolean;
};

export type AppointmentRow = {
  id: string;
  client_id: string;
  contact_id: string | null;
  service_id: string | null;
  assignee_ids: string[];
  start_at: string;
  end_at: string;
  status: string;
  title: string | null;
};

export type JobRow = {
  id: string;
  client_id: string;
  contact_id: string | null;
  quote_id: string | null;
  address: string | null;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  assignee_ids: string[];
  checklist: { id: string; label: string; done: boolean }[];
  photos: string[];
  recurrence_rule: string | null;
  notes: string | null;
  updated_at?: string | null;
};

export type QuoteRow = {
  id: string;
  client_id: string;
  contact_id: string | null;
  number: string;
  line_items: { name: string; qty: number; price: number; optional?: boolean }[];
  options: Record<string, unknown> | null;
  total: number;
  status: string;
  public_token: string;
  signed_at: string | null;
  expires_at: string | null;
};

export type InvoiceRow = {
  id: string;
  client_id: string;
  job_id: string | null;
  contact_id: string | null;
  number: string;
  line_items: { name: string; qty: number; price: number }[];
  total: number;
  amount_paid: number;
  due_at: string | null;
  status: string;
  public_token: string;
  stripe_payment_intent_id: string | null;
};

type TableDef<Row, Insert = Partial<Row> & Record<string, unknown>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      clients: TableDef<ClientRow>;
      memberships: TableDef<MembershipRow>;
      contacts: TableDef<ContactRow>;
      pipeline_stages: TableDef<PipelineStageRow>;
      leads: TableDef<LeadRow>;
      activities: TableDef<ActivityRow>;
      messages: TableDef<MessageRow>;
      calls: TableDef<{
        id: string;
        client_id: string;
        contact_id: string | null;
        direction: string;
        duration: number | null;
        recording_url: string | null;
        missed: boolean;
        twilio_call_sid: string | null;
        created_at: string;
      }>;
      reviews: TableDef<{
        id: string;
        created_at: string;
        client_id: string;
        rating: number;
        reviewer_name: string | null;
        reviewer_phone: string | null;
        reviewer_email: string | null;
        feedback: string | null;
        routed_to_google: boolean;
      }>;
      services: TableDef<ServiceRow>;
      availability: TableDef<{
        id: string;
        client_id: string;
        user_id: string;
        weekday: number;
        start_time: string;
        end_time: string;
        buffer_minutes: number;
        min_notice_hours: number;
      }>;
      appointments: TableDef<AppointmentRow>;
      quotes: TableDef<QuoteRow>;
      jobs: TableDef<JobRow>;
      invoices: TableDef<InvoiceRow>;
      audit_log: TableDef<{
        id: string;
        actor_id: string | null;
        action: string;
        entity: string;
        entity_id: string | null;
        client_id: string | null;
        diff: Record<string, unknown> | null;
        created_at: string;
      }>;
      support_tickets: TableDef<{
        id: string;
        client_id: string;
        user_id: string | null;
        subject: string;
        status: string;
        priority: string;
        messages: { body: string; at: string; from: string }[];
        created_at: string;
        updated_at: string | null;
      }>;
      workflow_runs: TableDef<{
        id: string;
        client_id: string;
        trigger: string;
        status: string;
        log: unknown;
        created_at: string;
      }>;
      plan_features: TableDef<{
        plan: string;
        feature: string;
        enabled: boolean;
      }>;
      contact_requests: TableDef<{
        id: string;
        created_at: string;
        name: string;
        phone: string;
        email: string;
        trade: string | null;
        preferred_time: string | null;
        message: string;
      }>;
      integrations: TableDef<{
        id: string;
        client_id: string;
        provider: string;
        encrypted_tokens: string | null;
        status: string;
        sync_error: string | null;
        created_at: string;
        updated_at: string | null;
      }>;
      push_subscriptions: TableDef<{
        id: string;
        user_id: string;
        client_id: string;
        endpoint: string;
        p256dh: string;
        auth: string;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      is_member: { Args: { p_client_id: string }; Returns: boolean };
      is_sitewyre_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
