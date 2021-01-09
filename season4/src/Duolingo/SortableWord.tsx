import React, { ReactElement } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
  useSharedValue,
  useDerivedValue,
} from "react-native-reanimated";
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from "react-native-gesture-handler";
import { useVector } from "react-native-redash";

import {
  isBeyondCenterOfMass,
  IsBeyondCenterOfMassArgs,
  calculateLayout,
  getSortedOffsets,
  lastOrder,
  Offset,
  remove,
  reorder,
  WORD_HEIGHT,
  SENTENCE_HEIGHT,
  MARGIN_LEFT,
  MARGIN_TOP,
} from "./Layout";
import Placeholder from "./components/Placeholder";

function isBeforeCenterOfMass(
  offset: Offset,
  iterationOffset: Offset,
  centerOfMassArgs: IsBeyondCenterOfMassArgs
) {
  "worklet";
  return (
    offset.order.value > iterationOffset.order.value &&
    isBeyondCenterOfMass({ ...centerOfMassArgs, inverse: true })
  );
}

function isAfterCenterOfMass(
  offset: Offset,
  iterationOffset: Offset,
  centerOfMassArgs: IsBeyondCenterOfMassArgs
) {
  "worklet";
  return (
    offset.order.value < iterationOffset.order.value &&
    isBeyondCenterOfMass(centerOfMassArgs)
  );
}

interface SortableWordProps {
  offsets: Offset[];
  children: ReactElement<{ id: number }>;
  index: number;
  containerWidth: number;
}

const SortableWord = ({
  offsets,
  index,
  children,
  containerWidth,
}: SortableWordProps) => {
  const offset = offsets[index];
  const isGestureActive = useSharedValue(false);
  const isAnimating = useSharedValue(false);
  const translation = useVector();
  const isInBank = useDerivedValue(() => offset.order.value === -1);

  const onGestureEvent = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    { x: number; y: number }
  >({
    onStart: (event, ctx) => {
      if (isInBank.value) {
        translation.x.value = offset.originalX.value - MARGIN_LEFT;
        translation.y.value = offset.originalY.value + MARGIN_TOP;
      } else {
        translation.x.value = offset.x.value;
        translation.y.value = offset.y.value;
      }
      ctx.x = translation.x.value;
      ctx.y = translation.y.value;
      isGestureActive.value = true;
    },
    onActive: ({ translationX, translationY }, ctx) => {
      translation.x.value = ctx.x + translationX;
      translation.y.value = ctx.y + translationY;

      if (isInBank.value) {
        if (translation.y.value < SENTENCE_HEIGHT) {
          offset.order.value = lastOrder(offsets);
          calculateLayout(offsets, containerWidth);
        }

        return;
      } else if (!isInBank.value && translation.y.value > SENTENCE_HEIGHT) {
        offset.order.value = -1;
        remove(offsets, index);
        calculateLayout(offsets, containerWidth);

        return;
      }

      const reorderingCandidates = [];
      let isAfter = false;
      let isBefore = false;

      const sortedOffsets = getSortedOffsets(offsets);
      for (let i = 0; i < sortedOffsets.length; i++) {
        const iterationOffset = sortedOffsets[i];
        if (offset === iterationOffset) {
          continue;
        }
        const centerOfMassArgs = {
          translation,
          offset,
          iterationOffset,
        };

        if (isAfterCenterOfMass(offset, iterationOffset, centerOfMassArgs)) {
          isAfter = true;
          reorderingCandidates.push(iterationOffset.order.value);
        } else if (
          isBeforeCenterOfMass(offset, iterationOffset, centerOfMassArgs)
        ) {
          isBefore = true;
          reorderingCandidates.push(iterationOffset.order.value);
        }
      }

      if (isAfter && isBefore) {
        throw new Error(
          "can't have the draggable element moving against centers of masses before and after it at the same time"
        );
      }

      if (reorderingCandidates.length === 0) {
        return;
      }

      const reorderingSubject = isAfter
        ? Math.max(...reorderingCandidates)
        : Math.min(...reorderingCandidates);

      reorder(offsets, offset.order.value, reorderingSubject);
      calculateLayout(offsets, containerWidth);
    },
    onEnd: () => {
      isGestureActive.value = false;
    },
  });

  const translateX = useDerivedValue(() => {
    if (isGestureActive.value) {
      return translation.x.value;
    }
    return withSpring(
      isInBank.value ? offset.originalX.value - MARGIN_LEFT : offset.x.value
    );
  });

  const translateY = useDerivedValue(() => {
    if (isGestureActive.value) {
      return translation.y.value;
    }
    return withSpring(
      isInBank.value ? offset.originalY.value + MARGIN_TOP : offset.y.value
    );
  });

  const style = useAnimatedStyle(() => {
    return {
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: isGestureActive.value || isAnimating.value ? 100 : 0,
      width: offset.width.value,
      height: WORD_HEIGHT,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  return (
    <>
      <Placeholder offset={offset} />
      <Animated.View style={style}>
        <PanGestureHandler onGestureEvent={onGestureEvent}>
          <Animated.View style={StyleSheet.absoluteFill}>
            {children}
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </>
  );
};

export default SortableWord;
