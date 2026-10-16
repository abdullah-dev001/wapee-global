import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { staleTimes } from '@/lib/query';
import { getSupabase } from '@/lib/supabase';
import { type UtcIso } from '@/lib/time';

import {
  buildAnswerRows,
  parseSnapshotFields,
  type AnswerRow,
  type RawAnswer,
  type SnapshotField,
} from '../answers';
import { appointmentKeys } from './useAppointments';

const ANSWER_COLUMNS = 'id, custom_field_id, form_version_id, value, is_sensitive';
const PAGE_SIZE = 20;

/** The snapshots (labels/types/order) for the form versions these answers were given under. */
async function fetchSnapshots(
  answers: readonly RawAnswer[],
): Promise<Map<string, readonly SnapshotField[]>> {
  const versionIds = [...new Set(answers.map((answer) => answer.form_version_id))];
  if (versionIds.length === 0) return new Map();
  const { data, error } = await getSupabase()
    .from('form_versions')
    .select('id, fields')
    .in('id', versionIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, parseSnapshotFields(row.fields)]));
}

/**
 * The booking-form answers on one appointment (detail drawer). RLS decides what
 * comes back: Own/Branch/All like the appointment itself, and sensitive answers
 * only with `clients.view_sensitive` (suite 43).
 */
export function useAppointmentAnswers(businessId: string | null, appointmentId: string | null) {
  const { isAuthenticated } = useSession();

  return useQuery<AnswerRow[]>({
    queryKey: appointmentKeys.detail(
      { businessId: businessId ?? 'none' },
      `answers:${appointmentId}`,
    ),
    enabled: isAuthenticated && Boolean(businessId && appointmentId),
    staleTime: staleTimes.list,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('appointment_field_values')
        .select(ANSWER_COLUMNS)
        .eq('appointment_id', appointmentId ?? '');
      if (error) throw error;
      const answers = data ?? [];
      return buildAnswerRows(answers, await fetchSnapshots(answers));
    },
  });
}

export type ClientAnswerVisit = {
  appointmentId: string;
  startsAt: UtcIso;
  serviceName: string | null;
  answers: AnswerRow[];
};

type ClientAnswersPage = {
  visits: ClientAnswerVisit[];
  nextCursor: { startsAt: string; id: string } | null;
};

/**
 * A client's booking-form answers, grouped by visit, newest first, 20 visits a
 * page with a keyset cursor (CLAUDE.md: server-side pagination). Only visits the
 * caller can see AND that have at least one visible answer are returned
 * (`!inner` join under RLS).
 */
export function useClientAnswers(businessId: string | null, clientId: string | null) {
  const { isAuthenticated } = useSession();

  return useInfiniteQuery<ClientAnswersPage>({
    queryKey: appointmentKeys.list({
      businessId: businessId ?? 'none',
      filters: { view: 'clientAnswers', clientId },
    }),
    enabled: isAuthenticated && Boolean(businessId && clientId),
    staleTime: staleTimes.list,
    placeholderData: keepPreviousData,
    initialPageParam: null as ClientAnswersPage['nextCursor'],
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as ClientAnswersPage['nextCursor'];
      let query = getSupabase()
        .from('appointments')
        .select(
          'id, starts_at, services(name), appointment_field_values!inner(id, custom_field_id, form_version_id, value, is_sensitive)',
        )
        .eq('business_id', businessId ?? '')
        .eq('client_id', clientId ?? '')
        .is('deleted_at', null)
        .order('starts_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (cursor) {
        query = query.or(
          `starts_at.lt.${cursor.startsAt},and(starts_at.eq.${cursor.startsAt},id.lt.${cursor.id})`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      const snapshots = await fetchSnapshots(rows.flatMap((row) => row.appointment_field_values));
      const visits = rows
        .map((row) => ({
          appointmentId: row.id,
          startsAt: row.starts_at as UtcIso,
          serviceName: row.services?.name ?? null,
          answers: buildAnswerRows(row.appointment_field_values, snapshots),
        }))
        .filter((visit) => visit.answers.length > 0);
      const last = rows[rows.length - 1];
      return {
        visits,
        nextCursor:
          rows.length === PAGE_SIZE && last ? { startsAt: last.starts_at, id: last.id } : null,
      };
    },
  });
}
