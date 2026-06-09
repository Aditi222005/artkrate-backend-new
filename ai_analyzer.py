from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import Image
import io
import json

# Load API Key from .env
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError("❌ GEMINI_API_KEY is not set in .env")

# Configure Gemini
genai.configure(api_key=api_key)
model = genai.GenerativeModel("models/gemini-2.5-flash")  # ✅ Vision-capable model

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://localhost:8080"])

@app.route('/api/ai-chatbox', methods=['POST'])
def chat_with_ai():
    try:
        prompt = request.form.get('message', '')
        image_file = request.files.get('image', None)

        if not prompt and not image_file:
            return jsonify({"error": "Please provide a message or an image"}), 400

        gemini_input = []

        # Add message text
        if prompt:
            gemini_input.append(prompt)

        # Add image if uploaded
        if image_file:
            image_bytes = image_file.read()
            image = Image.open(io.BytesIO(image_bytes))
            gemini_input.append(image)

        # Send to Gemini
        response = model.generate_content(gemini_input)

        return jsonify({ "reply": response.text })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({ "error": str(e) }), 500

@app.route('/api/compare-faces', methods=['POST'])
def compare_faces():
    try:
        selfie_file = request.files.get('selfie')
        document_file = request.files.get('document')

        if not selfie_file or not document_file:
            return jsonify({"success": False, "error": "Please upload both selfie and document images"}), 400

        # Load images using Pillow
        selfie_img = Image.open(io.BytesIO(selfie_file.read()))
        document_img = Image.open(io.BytesIO(document_file.read()))

        # System prompt for face verification
        prompt = (
            "You are an expert biometric verification system.\n"
            "Analyze the two provided images:\n"
            "1. The first image is a selfie of the seller.\n"
            "2. The second image is a photo from their government-issued identity document.\n\n"
            "Perform the following checks:\n"
            "1. Check if a human face is clearly present in both images.\n"
            "2. Compare the facial features in both images to determine if they belong to the same person.\n"
            "3. Calculate a similarity score between 0 and 100 based on facial structures (ignore age differences, facial hair, glasses, hairstyles, lighting, and photo quality/graininess).\n"
            "4. Determine the confidence level of the comparison: 'high', 'medium', or 'low'.\n"
            "5. Provide a brief remark/reason for your decision.\n\n"
            "You must respond ONLY with a valid JSON object. Do not include any markdown formatting or backticks.\n"
            "JSON format:\n"
            "{\n"
            "  \"face1_present\": true,\n"
            "  \"face2_present\": true,\n"
            "  \"matched\": true,\n"
            "  \"score\": 85,\n"
            "  \"level\": \"high\",\n"
            "  \"remarks\": \"description of match details\"\n"
            "}"
        )

        # Call Gemini Vision Model
        response = model.generate_content([prompt, selfie_img, document_img])
        
        # Clean response
        text_response = response.text.strip()
        if text_response.startswith("```"):
            lines = text_response.splitlines()
            if lines[0].startswith("```json") or lines[0].startswith("```"):
                text_response = "\n".join(lines[1:-1]).strip()

        result = json.loads(text_response)

        return jsonify({
            "success": True,
            "face1_present": result.get("face1_present", True),
            "face2_present": result.get("face2_present", True),
            "matched": result.get("matched", False),
            "score": result.get("score", 0),
            "level": result.get("level", "low"),
            "remarks": result.get("remarks", "")
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({ "success": False, "error": str(e) }), 500

if __name__ == '__main__':
    app.run(port=3000, debug=True)
