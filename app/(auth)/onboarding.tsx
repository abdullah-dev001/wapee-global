import { zodResolver } from '@hookform/resolvers/zod';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/shared/FormField';
import { Button, Select, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { DEFAULT_COUNTRY, findCountry, timezoneOptionsFor } from '@/config/countries';
import { allCountries, allCurrencies } from '@/config/localeData.generated';
import { AuthLayout } from '@/features/auth';
import { useCreateBusiness, useSlugAvailable } from '@/features/onboarding/api/useBusiness';
import {
  onboardingSchema,
  slugify,
  type OnboardingValues,
} from '@/features/onboarding/schemas/onboarding.schemas';
import { useDebounce } from '@/hooks/useDebounce';
import { theme } from '@/lib/theme';

const INDUSTRY_KEYS = [
  'salon',
  'clinic',
  'spa',
  'dental',
  'physio',
  'pet',
  'fitness',
  'consultant',
  'tattoo',
  'other',
] as const;

const TOTAL_STEPS = 2;

/** Device country, used only to pre-fill the form. */
function deviceCountry() {
  const regionCode = getLocales()[0]?.regionCode;
  return findCountry(regionCode) ?? DEFAULT_COUNTRY;
}

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const createBusiness = useCreateBusiness();
  const [step, setStep] = useState(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);

  const initial = useMemo(() => deviceCountry(), []);

  const { control, handleSubmit, setValue, trigger, formState } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      slug: '',
      industry: '',
      countryCode: initial.code,
      currency: initial.currency,
      timezone: initial.timezone,
      language: 'en',
      branchName: '',
    },
  });

  // useWatch rather than watch(): watch() returns a fresh function each render,
  // which React Compiler cannot memoize (it skips the whole component).
  const slug = useWatch({ control, name: 'slug' });
  const countryCode = useWatch({ control, name: 'countryCode' });

  // These lists are large (280 / 162 / 418 entries). Building them inline in
  // JSX hands Select a brand-new array on every render, which re-renders Select,
  // which renders again: "Maximum update depth exceeded". Memoise all three.
  const countryOptions = useMemo(
    () =>
      allCountries.map((country) => {
        const preset = findCountry(country.code);
        return {
          value: country.code,
          label: country.name,
          hint: preset ? `${preset.currency} · ${preset.timezone}` : undefined,
        };
      }),
    [],
  );

  const currencyOptions = useMemo(
    () =>
      allCurrencies.map((currency) => ({
        value: currency.code,
        label: currency.code,
        hint: currency.name,
      })),
    [],
  );

  const timezoneOptions = useMemo(
    () => timezoneOptionsFor(countryCode).map((zone) => ({ value: zone, label: zone })),
    [countryCode],
  );

  // Both of these used to be effects watching form values, which looped:
  // setValue re-rendered, the watched value looked "new", the effect ran again.
  // They are reactions to a user action, so they belong in the handlers.

  /** Suggest a slug from the name until the owner edits the slug themselves. */
  const handleNameChange = (value: string) => {
    if (!slugEdited) setValue('slug', slugify(value), { shouldValidate: value.length > 0 });
  };

  /** Country sets currency and timezone, but both stay editable afterwards. */
  const handleCountryChange = (code: string) => {
    setValue('countryCode', code, { shouldValidate: true });
    const country = findCountry(code);
    if (!country) return;
    setValue('currency', country.currency);
    setValue('timezone', country.timezone);
  };

  const debouncedSlug = useDebounce(slug, 400);
  const slugFormatValid = !formState.errors.slug && debouncedSlug.length >= 3;
  const slugCheck = useSlugAvailable(debouncedSlug, slugFormatValid);

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    createBusiness.mutate(values, {
      onSuccess: () => router.replace('/today'),
      onError: (error) => setServerError(error.message),
    });
  });

  const goNext = async () => {
    const ok = await trigger(['name', 'slug']);
    if (ok && slugCheck.data !== false) setStep(2);
  };

  return (
    <AuthLayout
      title={t('onboarding.title')}
      subtitle={t('onboarding.subtitle')}
      footer={
        <Text variant="helper" color="textMuted">
          {t('onboarding.step', { current: step, total: TOTAL_STEPS })}
        </Text>
      }
    >
      <View style={styles.form}>
        {serverError ? (
          <View style={styles.alert}>
            <Text variant="small" color="error">
              {serverError}
            </Text>
          </View>
        ) : null}

        {step === 1 ? (
          <>
            <FormField
              control={control}
              name="name"
              label={t('onboarding.fields.name')}
              placeholder={t('onboarding.placeholders.name')}
              autoCapitalize="words"
              returnKeyType="next"
              onValueChange={handleNameChange}
            />

            <View>
              <FormField
                control={control}
                name="slug"
                label={t('onboarding.fields.slug')}
                placeholder={t('onboarding.placeholders.slug')}
                autoCapitalize="none"
                autoCorrect={false}
                onValueChange={() => setSlugEdited(true)}
                hint={t('onboarding.hints.slug', {
                  siteUrl: brand.urls.publicSite.replace(/^https?:\/\//, ''),
                  slug: slug || t('onboarding.placeholders.slug'),
                })}
              />
              {slugFormatValid ? (
                <Text
                  variant="helper"
                  color={
                    slugCheck.isFetching
                      ? 'textMuted'
                      : slugCheck.data === true
                        ? 'success'
                        : slugCheck.data === false
                          ? 'error'
                          : 'textMuted'
                  }
                >
                  {slugCheck.isFetching
                    ? t('onboarding.slug.checking')
                    : slugCheck.data === true
                      ? t('onboarding.slug.available')
                      : slugCheck.data === false
                        ? t('onboarding.slug.taken')
                        : ''}
                </Text>
              ) : null}
            </View>

            <Controller
              control={control}
              name="industry"
              render={({ field }) => (
                <Select
                  label={t('onboarding.fields.industry')}
                  value={field.value || null}
                  onChange={field.onChange}
                  options={INDUSTRY_KEYS.map((key) => ({
                    value: key,
                    label: t(`onboarding.industries.${key}` as never),
                  }))}
                />
              )}
            />

            <Button fullWidth size="lg" onPress={goNext}>
              {t('onboarding.actions.continue')}
            </Button>
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text variant="cardTitle">{t('onboarding.steps.location')}</Text>
              <Text variant="helper" color="textSecondary">
                {t('onboarding.locationIntro')}
              </Text>
            </View>

            <FormField
              control={control}
              name="branchName"
              label={t('onboarding.fields.branchName')}
              placeholder={t('onboarding.placeholders.branchName')}
              hint={t('onboarding.hints.branchName')}
              returnKeyType="next"
            />

            <Controller
              control={control}
              name="countryCode"
              render={({ field }) => (
                <Select
                  label={t('onboarding.fields.country')}
                  value={field.value}
                  onChange={handleCountryChange}
                  hint={t('onboarding.hints.country')}
                  // Every ISO country, not just the ones with a pre-fill.
                  options={countryOptions}
                  required
                />
              )}
            />

            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  label={t('onboarding.fields.currency')}
                  value={field.value}
                  onChange={field.onChange}
                  options={currencyOptions}
                  hint={t('onboarding.hints.currency')}
                  required
                />
              )}
            />

            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <Select
                  label={t('onboarding.fields.timezone')}
                  value={field.value}
                  onChange={field.onChange}
                  // The country's own zones first, then every other IANA zone.
                  options={timezoneOptions}
                  hint={t('onboarding.hints.timezone')}
                  required
                />
              )}
            />

            <View style={styles.actions}>
              <Button variant="ghost" onPress={() => setStep(1)}>
                {t('onboarding.actions.back')}
              </Button>
              <Button onPress={onSubmit} loading={createBusiness.isPending} style={styles.grow}>
                {t('onboarding.actions.create')}
              </Button>
            </View>
          </>
        )}
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  form: { gap: theme.spacing[16] },
  alert: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.errorLight,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.error,
  },
  sectionHeader: { gap: theme.spacing[4] },
  actions: { flexDirection: 'row', gap: theme.spacing[8], alignItems: 'center' },
  grow: { flex: 1 },
});
