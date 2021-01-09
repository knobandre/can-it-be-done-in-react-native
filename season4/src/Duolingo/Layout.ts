import Animated from "react-native-reanimated";
import { between, move, Vector } from "react-native-redash";

import { SharedValues } from "../components/AnimatedHelpers";

export const MARGIN_TOP = 150;
export const MARGIN_LEFT = 32;
export const NUMBER_OF_LINES = 3;
export const WORD_HEIGHT = 55;
export const SENTENCE_HEIGHT = (NUMBER_OF_LINES - 1) * WORD_HEIGHT;

export type Offset = SharedValues<{
  order: number;
  width: number;
  x: number;
  y: number;
  originalX: number;
  originalY: number;
}>;

export interface IsBeyondCenterOfMassArgs {
  translation: Vector<Animated.SharedValue<number>>;
  offset: Offset;
  iterationOffset: Offset;
  inverse?: boolean;
}

export const isBeyondCenterOfMass = (args: IsBeyondCenterOfMassArgs) => {
  "worklet";

  const { translation, offset, iterationOffset, inverse } = args;

  const iterationOffsetMidpointX =
    (iterationOffset.x.value * 2 + iterationOffset.width.value) / 2;

  const isBeyondX = inverse
    ? translation.x.value <= iterationOffsetMidpointX
    : translation.x.value + offset.width.value >= iterationOffsetMidpointX;

  const offsetMidpointY = (translation.y.value * 2 + WORD_HEIGHT) / 2;

  return (
    isBeyondX &&
    between(
      offsetMidpointY,
      iterationOffset.y.value,
      iterationOffset.y.value + WORD_HEIGHT
    )
  );
};

const isNotInBank = (offset: Offset) => {
  "worklet";
  return offset.order.value !== -1;
};

const byOrder = (a: Offset, b: Offset) => {
  "worklet";
  return a.order.value > b.order.value ? 1 : -1;
};

export const getSortedOffsets = (input: Offset[]) => {
  "worklet";
  return input.filter(isNotInBank).sort(byOrder);
};

export const lastOrder = (input: Offset[]) => {
  "worklet";
  return input.filter(isNotInBank).length;
};

export const remove = (input: Offset[], index: number) => {
  "worklet";
  const offsets = input.filter((o, i) => i !== index).filter(isNotInBank);
  offsets.map((offset, i) => (offset.order.value = i));
};

export const reorder = (input: Offset[], from: number, to: number) => {
  "worklet";
  const offsets = getSortedOffsets(input);
  const newOffset = move(offsets, from, to);
  newOffset.map((offset, index) => (offset.order.value = index));
};

export const calculateLayout = (input: Offset[], containerWidth: number) => {
  "worklet";
  const offsets = getSortedOffsets(input);
  if (offsets.length === 0) {
    return;
  }
  let lineNumber = 0;
  let lineBreak = 0;

  offsets.forEach((offset, index) => {
    const total = offsets
      .slice(lineBreak, index)
      .reduce((acc, o) => acc + o.width.value, 0);

    if (total + offset.width.value > containerWidth) {
      lineNumber += 1;
      lineBreak = index;
      offset.x.value = 0;
    } else {
      offset.x.value = total;
    }
    offset.y.value = WORD_HEIGHT * lineNumber;
  });
};
