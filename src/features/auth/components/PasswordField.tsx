import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { FormField, type FormFieldProps } from '@/components/shared/FormField';
import { theme } from '@/lib/theme';

export type PasswordFieldProps<TValues extends FieldValues> = Omit<
  FormFieldProps<TValues>,
  'secureTextEntry' | 'endAdornment'
> & {
  control: Control<TValues>;
  name: FieldPath<TValues>;
};

/** Password input with a show/hide toggle (DESIGN_GUIDE §12.2). */
export function PasswordField<TValues extends FieldValues>(props: PasswordFieldProps<TValues>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <FormField
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      endAdornment={
        <Pressable
          onPress={() => setVisible((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
          accessibilityState={{ selected: visible }}
          // Not a tab stop: the field itself is what keyboard users focus.
          focusable={false}
        >
          <Icon
            size={theme.iconSize.sm}
            strokeWidth={theme.iconStroke}
            color={theme.colors.textMuted}
          />
        </Pressable>
      }
    />
  );
}
