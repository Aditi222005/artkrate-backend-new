import os
import requests
from PIL import Image
import io

def test_analyze_art():
    print("Testing /api/analyze-art endpoint...")
    url = "http://127.0.0.1:3000/api/analyze-art"
    
    # Create a simple 100x100 placeholder image in memory
    img = Image.new('RGB', (100, 100), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    
    files = {
        'image': ('test_image.jpg', img_byte_arr, 'image/jpeg')
    }
    
    try:
        response = requests.post(url, files=files)
        print("Status Code:", response.status_code)
        print("Response JSON:", response.json())
        assert response.status_code == 200
        assert "response" in response.json()
        assert "title" in response.json()["response"]
        print("[SUCCESS] /api/analyze-art test passed successfully!")
    except Exception as e:
        print("[FAIL] Test failed:", e)

def test_ai_chatbox():
    print("\nTesting /api/ai-chatbox endpoint...")
    url = "http://127.0.0.1:3000/api/ai-chatbox"
    
    data = {
        'message': 'Hello, what can you do?'
    }
    
    try:
        response = requests.post(url, data=data)
        print("Status Code:", response.status_code)
        print("Response JSON:", response.json())
        assert response.status_code == 200
        assert "reply" in response.json()
        print("[SUCCESS] /api/ai-chatbox test passed successfully!")
    except Exception as e:
        print("[FAIL] Test failed:", e)

if __name__ == "__main__":
    test_analyze_art()
    test_ai_chatbox()
