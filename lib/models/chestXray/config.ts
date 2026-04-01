export const modelConfig = {
  modelPath: '/chestxray_densenet121.onnx',
  inputSize: [224, 224] as const,
  threshold: 0.3,
  labels: ['Normal', 'Lung Cancer'] as const
};

export type ModelLabel = (typeof modelConfig.labels)[number];
