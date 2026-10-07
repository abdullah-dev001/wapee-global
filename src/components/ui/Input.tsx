import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { focusRing, theme } from '@/lib/theme';

import { Text } from './Text';

export type InputProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  /** Label above the field. */
  label?: string;
  /** Helper text under the field. Replaced by `error` when there is one. */
  hint?: string;
  /** Error message under the field; also turns the border red. */
  error?: string;
  /** Adds a red `*` next to the label. */
  required?: boolean;
  /** Static text inside the field, before the input (e.g. "wapee.site/"). */
  prefix?: string;
  /** Node at the end inside the field (e.g. a reveal button or status icon). */
  endAdornment?: ReactNode;
  containerStyle?: ViewStyle;
};

/**
 * Text field with the label above. Height ~40px to line up with a md Button.
 * Focus = primary border + 3px ring (web). Error border overrides focus.
 * Disabled = `surfaceHover` background, via `editable={false}`.
 */
export function Input({
  label,
  hint,
  error,
  required = false,
  prefix,
  endAdornment,
  containerStyle,
  editable = true,
  onFocus,
  onBlur,
  multiline,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const hasError = Boolean(error);
  const disabled = !editable;

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };
  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  const borderColor = hasError
    ? theme.colors.error
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label">
          {label}
          {required ? (
            <Text variant="label" color="error">
              {' *'}
            </Text>
          ) : null}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            borderColor,
            backgroundColor: disabled ? theme.colors.surfaceHover : theme.colors.surface,
          },
          multiline ? styles.fieldMultiline : null,
          focused && !hasError ? focusRing() : null,
        ]}
      >
        {prefix ? (
          <Text variant="body" color="textMuted" style={styles.prefix}>
            {prefix}
          </Text>
        ) : null}

        <TextInput
          {...rest}
          editable={editable}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          aria-errormessage={hasError ? messageId : undefined}
          aria-invalid={hasError}
          style={[
            styles.input,
            theme.text.body,
            { color: disabled ? theme.colors.textMuted : theme.colors.textPrimary },
            prefix ? styles.inputWithPrefix : null,
            multiline ? styles.inputMultiline : null,
          ]}
        />

        {endAdornment ? <View style={styles.adornment}>{endAdornment}</View> : null}
      </View>

      {hasError ? (
        <Text variant="helper" color="errorText" nativeID={messageId} role="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="helper" color="textSecondary" nativeID={messageId}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[6],
    width: '100%',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.controlHeight.input,
    borderWidth: theme.borderWidth.hairline,
    borderStyle: 'solid',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  fieldMultiline: {
    minHeight: theme.controlHeight.input * 2.4,
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[10],
    // RN web adds its own focus outline on the inner input; the wrapper shows focus.
    outlineWidth: 0,
  },
  inputWithPrefix: {
    paddingStart: theme.spacing[2],
  },
  inputMultiline: {
    textAlignVertical: 'top',
  },
  prefix: {
    paddingStart: theme.spacing[12],
  },
  adornment: {
    paddingEnd: theme.spacing[12],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
