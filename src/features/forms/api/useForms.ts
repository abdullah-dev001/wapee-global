import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { callPublicFunction } from '@/features/booking-public/api/client';
import { useSession } from '@/features/auth';
import { createQueryKeys, staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { rpcNull, unwrapRpc } from '@/lib/supabase/rpcResult';

import {
  type Answers,
  type FormBlock,
  type FormField,
  type Signature,
  type TemplateDraft,
} from '../formsLogic';

export const formKeys = createQueryKeys('form-templates');
export const consentKeys = createQueryKeys('signed-consents');

export type FormTemplate = {
  id: string;
  kind: 'intake' | 'consent';
  title: string;
  isActive: boolean;
  version: number;
  requiresSignature: boolean;
  body: FormBlock[];
  fields: FormField[];
  serviceIds: string[];
};

/** Templates of the business with their LATEST version and the services they are attached to. */
export function useFormTemplates(
  businessId: string | null,
  enabled = true,
): UseQueryResult<FormTemplate[], Error> {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: formKeys.list({ businessId: businessId ?? 'none' }),
    enabled: isAuthenticated && enabled && Boolean(businessId),
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('form_templates')
        .select(
          'id, kind, title, is_active, form_template_versions(version, title, fields, body, requires_signature), form_template_services(service_id)',
        )
        .eq('business_id', businessId ?? '')
        .is('deleted_at', null)
        .order('title', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []).flatMap((row) => {
        const latest = [...(row.form_template_versions ?? [])].sort(
          (a, b) => b.version - a.version,
        )[0];
        if (!latest) return [];
        return [
          {
            id: row.id,
            kind: row.kind as FormTemplate['kind'],
            title: row.title,
            isActive: row.is_active,
            version: latest.version,
            requiresSignature: latest.requires_signature,
            body: (latest.body as unknown as FormBlock[]) ?? [],
            fields: (latest.fields as unknown as FormField[]) ?? [],
            serviceIds: (row.form_template_services ?? []).map((s) => s.service_id),
          },
        ];
      });
    },
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, businessId: string | null) {
  if (!businessId) return;
  void queryClient.invalidateQueries({ queryKey: formKeys.business(businessId) });
  void queryClient.invalidateQueries({ queryKey: consentKeys.business(businessId) });
}

export function useSaveFormTemplate(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { templateId: string | null; draft: TemplateDraft }) => {
      const { draft } = input;
      const { data, error } = await getSupabase().rpc('save_form_template', {
        p_business_id: businessId ?? '',
        p_template_id: input.templateId ?? rpcNull<string>(),
        p_kind: draft.kind,
        p_title: draft.title,
        p_fields: draft.fields.map((f) => ({
          id: f.id,
          type: f.type,
          label: f.label,
          help: f.help ?? null,
          required: f.required,
          sensitive: f.sensitive,
          options: f.type === 'dropdown' ? (f.options ?? []).map((o) => o.trim()) : null,
        })),
        p_body: draft.body.map((b) => ({ type: b.type, text: b.text })),
        p_requires_signature: draft.requiresSignature,
        p_service_ids: draft.serviceIds,
        p_is_active: draft.isActive,
      });
      return unwrapRpc<{ template_id: string; version: number; new_version: boolean }>(data, error);
    },
    onSuccess: () => invalidate(queryClient, businessId),
  });
}

export function useDeleteFormTemplate(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await getSupabase().rpc('delete_form_template', {
        p_template_id: templateId,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidate(queryClient, businessId),
  });
}

export type SignedConsentRow = {
  id: string;
  title: string;
  kind: 'intake' | 'consent';
  version: number;
  templateId: string;
  signerName: string;
  signedAt: string;
  signedVia: 'dashboard' | 'link';
  appointmentId: string | null;
  hasSignature: boolean;
  voidedAt: string | null;
  voidReason: string | null;
};

/** Signed copies of one client (metadata only: the answers come from `get_signed_consent`). */
export function useSignedConsents(
  businessId: string | null,
  clientId: string | null,
  enabled: boolean,
) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: consentKeys.list({ businessId: businessId ?? 'none', filters: { clientId } }),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(clientId),
    staleTime: staleTimes.liveShort,
    retry: false,
    queryFn: async (): Promise<SignedConsentRow[] | null> => {
      const { data, error } = await getSupabase().rpc('list_signed_consents', {
        p_client_id: clientId ?? '',
      });
      if (error) throw new Error(error.message);
      const r = data as { ok?: boolean; rows?: Record<string, unknown>[] } | null;
      if (!r || r.ok !== true) return null;
      return (r.rows ?? []).map((x) => ({
        id: String(x.id),
        title: String(x.title),
        kind: x.kind as SignedConsentRow['kind'],
        version: Number(x.version),
        templateId: String(x.template_id),
        signerName: String(x.signer_name),
        signedAt: String(x.signed_at),
        signedVia: x.signed_via as SignedConsentRow['signedVia'],
        appointmentId: (x.appointment_id as string | null) ?? null,
        hasSignature: x.has_signature === true,
        voidedAt: (x.voided_at as string | null) ?? null,
        voidReason: (x.void_reason as string | null) ?? null,
      }));
    },
  });
}

export type SignedConsentDetail = {
  title: string;
  version: number;
  signerName: string;
  signedAt: string;
  signedVia: 'dashboard' | 'link';
  signature: Signature | null;
  voidedAt: string | null;
  voidReason: string | null;
  body: FormBlock[];
  answers: { fieldId: string; label: string; type: string; value: unknown; redacted: boolean }[];
};

export function useSignedConsent(businessId: string | null, id: string | null) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: consentKeys.detail({ businessId: businessId ?? 'none' }, id ?? 'none'),
    enabled: isAuthenticated && Boolean(businessId) && Boolean(id),
    staleTime: staleTimes.liveShort,
    queryFn: async (): Promise<SignedConsentDetail> => {
      const { data, error } = await getSupabase().rpc('get_signed_consent', { p_id: id ?? '' });
      const r = unwrapRpc<Record<string, unknown>>(data, error);
      return {
        title: String(r.title),
        version: Number(r.version),
        signerName: String(r.signer_name),
        signedAt: String(r.signed_at),
        signedVia: r.signed_via as SignedConsentDetail['signedVia'],
        signature: (r.signature as Signature | null) ?? null,
        voidedAt: (r.voided_at as string | null) ?? null,
        voidReason: (r.void_reason as string | null) ?? null,
        body: (r.body as FormBlock[]) ?? [],
        answers: ((r.answers as Record<string, unknown>[]) ?? []).map((a) => ({
          fieldId: String(a.field_id),
          label: String(a.label),
          type: String(a.type),
          value: a.value,
          redacted: a.redacted === true,
        })),
      };
    },
  });
}

export type AppointmentForm = {
  templateId: string;
  title: string;
  kind: 'intake' | 'consent';
  requiresSignature: boolean;
  status: 'pending' | 'signed';
  signedConsentId: string | null;
};

/** The forms attached to the appointment's service, each pending or signed. */
export function useAppointmentForms(
  businessId: string | null,
  appointmentId: string | null,
  enabled: boolean,
) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: consentKeys.list({
      businessId: businessId ?? 'none',
      filters: { appointmentForms: appointmentId },
    }),
    enabled: isAuthenticated && enabled && Boolean(businessId) && Boolean(appointmentId),
    staleTime: staleTimes.liveShort,
    retry: false,
    queryFn: async (): Promise<AppointmentForm[] | null> => {
      const { data, error } = await getSupabase().rpc('appointment_forms', {
        p_appointment_id: appointmentId ?? '',
      });
      if (error) throw new Error(error.message);
      const r = data as { ok?: boolean; rows?: Record<string, unknown>[] } | null;
      if (!r || r.ok !== true) return null;
      return (r.rows ?? []).map((x) => ({
        templateId: String(x.template_id),
        title: String(x.title),
        kind: x.kind as AppointmentForm['kind'],
        requiresSignature: x.requires_signature === true,
        status: x.status as AppointmentForm['status'],
        signedConsentId: (x.signed_consent_id as string | null) ?? null,
      }));
    },
  });
}

export function useRecordSignedConsent(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientId: string;
      appointmentId: string | null;
      templateId: string;
      answers: Answers;
      signerName: string;
      signature: Signature | null;
    }) => {
      const { data, error } = await getSupabase().rpc('record_signed_consent', {
        p_client_id: input.clientId,
        p_appointment_id: input.appointmentId ?? rpcNull<string>(),
        p_template_id: input.templateId,
        p_answers: input.answers,
        p_signer_name: input.signerName,
        p_signature:
          input.signature && input.signature.length > 0 ? input.signature : rpcNull<never>(),
      });
      return unwrapRpc<{ signed_consent_id: string }>(data, error);
    },
    onSuccess: () => invalidate(queryClient, businessId),
  });
}

export function useCreateFormRequest(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientId: string;
      appointmentId: string | null;
      templateId: string;
      send: boolean;
    }) => {
      const { data, error } = await getSupabase().rpc('create_form_request', {
        p_client_id: input.clientId,
        p_appointment_id: input.appointmentId ?? rpcNull<string>(),
        p_template_id: input.templateId,
        p_send: input.send,
      });
      return unwrapRpc<{ token: string; expires_at: string; queued: boolean }>(data, error);
    },
    onSuccess: () => invalidate(queryClient, businessId),
  });
}

export function useVoidSignedConsent(businessId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { data, error } = await getSupabase().rpc('void_signed_consent', {
        p_id: input.id,
        p_reason: input.reason,
      });
      return unwrapRpc(data, error);
    },
    onSuccess: () => invalidate(queryClient, businessId),
  });
}

// ---------------------------------------------------------------------------
// The PUBLIC signing page (no account): token in, form out, signature back.
// ---------------------------------------------------------------------------
export type PublicForm = {
  businessName: string;
  clientFirstName: string;
  title: string;
  kind: 'intake' | 'consent';
  body: FormBlock[];
  fields: FormField[];
  requiresSignature: boolean;
};

export function usePublicForm(token: string | null | undefined) {
  return useQuery({
    queryKey: ['public-form', token ?? 'none'],
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: (count, error) => {
      const code = (error as { code?: string }).code;
      return code === 'invalid_token' || code === 'bad_request' ? false : count < 2;
    },
    queryFn: async (): Promise<PublicForm> => {
      const raw = await callPublicFunction<Record<string, unknown>>('sign_form', {
        action: 'get',
        token,
      });
      return {
        businessName: String(raw.business_name ?? ''),
        clientFirstName: String(raw.client_first_name ?? ''),
        title: String(raw.title ?? ''),
        kind: raw.kind as PublicForm['kind'],
        body: (raw.body as FormBlock[]) ?? [],
        fields: (raw.fields as FormField[]) ?? [],
        requiresSignature: raw.requires_signature === true,
      };
    },
  });
}

export function useSubmitPublicForm() {
  return useMutation({
    mutationFn: async (input: {
      token: string;
      answers: Answers;
      signerName: string;
      signature: Signature | null;
      honeypot: string;
    }) =>
      callPublicFunction('sign_form', {
        action: 'submit',
        token: input.token,
        answers: input.answers,
        signer_name: input.signerName,
        signature: input.signature && input.signature.length > 0 ? input.signature : null,
        company_website: input.honeypot,
      }),
  });
}
