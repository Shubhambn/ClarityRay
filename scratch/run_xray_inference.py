import json
import numpy as np
import onnxruntime as ort
from PIL import Image

def preprocess_image(img_path, mean, std):
    # Load image and convert to RGB
    img = Image.open(img_path).convert('RGB')
    # Resize to 224x224
    img = img.resize((224, 224), Image.Resampling.BILINEAR)
    # Convert to numpy array in [0, 1] range
    arr = np.array(img).astype(np.float32) / 255.0
    # Normalize channels
    for c in range(3):
        arr[:, :, c] = (arr[:, :, c] - mean[c]) / std[c]
    # HWC to CHW
    arr = np.transpose(arr, (2, 0, 1))
    # Add batch dimension [1, 3, 224, 224]
    arr = np.expand_dims(arr, axis=0)
    return arr

def main():
    model_path = 'public/models/densenet121-chest/model.onnx'
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]
    
    sess = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
    input_name = sess.get_inputs()[0].name
    
    normal_img = preprocess_image('uploads/normal_chest_xray.png', mean, std)
    cancer_img = preprocess_image('uploads/cancer_chest_xray.png', mean, std)
    
    normal_out = sess.run(None, {input_name: normal_img})[0]
    cancer_out = sess.run(None, {input_name: cancer_img})[0]
    
    def softmax(x):
        e_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
        return e_x / e_x.sum(axis=-1, keepdims=True)
    
    normal_probs = softmax(normal_out)[0]
    cancer_probs = softmax(cancer_out)[0]
    
    print('--- python direct model inference results ---')
    print('Normal X-ray logits:', normal_out[0], 'softmax:', normal_probs)
    print('Cancer X-ray logits:', cancer_out[0], 'softmax:', cancer_probs)

if __name__ == '__main__':
    main()
