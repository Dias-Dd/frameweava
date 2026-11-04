import type {ImageCharacterJoints} from 'spatial-creation-candidate';
// Static source UV landmarks: top-left0/0, right/down positive. Edit for your art.
export const joints={
  "hips": [
    0.5,
    0.5433333333333333
  ],
  "chest": [
    0.5,
    0.34
  ],
  "head": [
    0.5,
    0.26666666666666666
  ],
  "leftUpperArm": [
    0.39,
    0.34
  ],
  "leftLowerArm": [
    0.21999999999999997,
    0.45
  ],
  "leftHand": [
    0.12,
    0.5733333333333334
  ],
  "leftUpperLeg": [
    0.435,
    0.5433333333333333
  ],
  "leftLowerLeg": [
    0.415,
    0.7166666666666667
  ],
  "leftFoot": [
    0.405,
    0.8833333333333333
  ],
  "rightUpperArm": [
    0.61,
    0.34
  ],
  "rightLowerArm": [
    0.78,
    0.45
  ],
  "rightHand": [
    0.88,
    0.5733333333333334
  ],
  "rightUpperLeg": [
    0.565,
    0.5433333333333333
  ],
  "rightLowerLeg": [
    0.585,
    0.7166666666666667
  ],
  "rightFoot": [
    0.595,
    0.8833333333333333
  ]
} as const satisfies ImageCharacterJoints;
