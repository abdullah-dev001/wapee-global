import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  PAD_HEIGHT,
  PAD_WIDTH,
  roundPoint,
  strokePath,
  type Signature,
} from '@/features/forms/formsLogic';
import { theme } from '@/lib/theme';

import { Text } from '../ui';

/**
 * A signature pad with NO extra dependency: the View's responder events collect the strokes, `react-native-svg`
 * draws them. Works the same with a finger, a stylus or a mouse on web, iOS and Android. Points are
 * stored normalised to 0..1 of the pad, so the drawing is resolution independent and is shown
 * back with `SignatureView`.
 */
export function SignaturePad({
  value,
  onChange,
  clearLabel,
  hint,
  disabled = false,
  accessibilityLabel,
}: {
  value: Signature;
  onChange: (next: Signature) => void;
  clearLabel: string;
  hint?: string;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  // The latest strokes for the gesture handlers (written in an effect, read only inside handlers).
  const latest = useRef<Signature>(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const point = (x: number, y: number): [number, number] =>
    roundPoint(x / size.width, y / size.height);

  const begin = (e: GestureResponderEvent) => {
    const next: Signature = [
      ...latest.current,
      [point(e.nativeEvent.locationX, e.nativeEvent.locationY)],
    ];
    latest.current = next;
    onChange(next);
  };
  const extend = (e: GestureResponderEvent) => {
    const last = latest.current[latest.current.length - 1];
    if (!last || last.length >= 1000) return;
    const next: Signature = [
      ...latest.current.slice(0, -1),
      [...last, point(e.nativeEvent.locationX, e.nativeEvent.locationY)],
    ];
    latest.current = next;
    onChange(next);
  };

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({
      width: Math.max(1, e.nativeEvent.layout.width),
      height: Math.max(1, e.nativeEvent.layout.height),
    });

  const clear = () => {
    latest.current = [];
    onChange([]);
  };

  return (
    <View style={styles.wrap}>
      <View
        // a pad inside a scroll view keeps the gesture
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={begin}
        onResponderMove={extend}
        onLayout={onLayout}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        // `touchAction: none` stops the browser scrolling while drawing (web only; ignored natively)
        style={[styles.pad, disabled ? styles.disabled : null, { touchAction: 'none' } as object]}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${PAD_WIDTH} ${PAD_HEIGHT}`}
          pointerEvents="none"
        >
          {value.map((stroke, i) => (
            <Path
              key={i}
              d={strokePath(stroke)}
              stroke={theme.colors.textPrimary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
        {value.length === 0 && hint ? (
          <View style={styles.hint} pointerEvents="none">
            <Text variant="helper" color="textMuted">
              {hint}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        variant="helper"
        color="primary"
        onPress={disabled ? undefined : clear}
        accessibilityRole="button"
      >
        {clearLabel}
      </Text>
    </View>
  );
}

/** Read-only drawing of a stored signature. */
export function SignatureView({
  signature,
  accessibilityLabel,
}: {
  signature: Signature;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.pad} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${PAD_WIDTH} ${PAD_HEIGHT}`}>
        {signature.map((stroke, i) => (
          <Path
            key={i}
            d={strokePath(stroke)}
            stroke={theme.colors.textPrimary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing[8] },
  pad: {
    width: '100%',
    aspectRatio: PAD_WIDTH / PAD_HEIGHT,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  disabled: { opacity: 0.55 },
  hint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
