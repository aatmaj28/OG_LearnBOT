#!/usr/bin/env python3
"""
Test script to verify Blackwell vLLM connection via SSH tunnel
Usage: python test_blackwell_connection.py
"""

import requests
import json
import time
import sys

# Configuration (should match your .env.local)
REMOTE_BLACKWELL_URL = "http://localhost:8001/v1/chat/completions"
REMOTE_BLACKWELL_MODEL = "google/gemma-3-27b-it"
REMOTE_A6000_URL = "http://localhost:5001/api/generate"
REMOTE_A6000_MODEL = "gemma3:27b"

def print_header(text):
    print("\n" + "="*80)
    print(f"  {text}")
    print("="*80 + "\n")

def test_blackwell_connection():
    """Test Blackwell vLLM connection"""
    print_header("🧪 Testing Blackwell vLLM Connection")
    
    print(f"📡 Endpoint: {REMOTE_BLACKWELL_URL}")
    print(f"🤖 Model: {REMOTE_BLACKWELL_MODEL}")
    print(f"⏱️  Timeout: 30 seconds\n")
    
    try:
        print("🔄 Sending test request...")
        start_time = time.time()
        
        response = requests.post(
            REMOTE_BLACKWELL_URL,
            json={
                "model": REMOTE_BLACKWELL_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "Say 'Hello from Blackwell!' and nothing else."}
                ],
                "temperature": 0.2,
                "max_tokens": 50,
                "stream": False
            },
            timeout=30
        )
        
        elapsed_time = time.time() - start_time
        
        print(f"📊 Status Code: {response.status_code}")
        print(f"⏱️  Response Time: {elapsed_time:.2f}s\n")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS! Blackwell is responding correctly!\n")
            print(f"📝 Response:")
            print(f"   {result['choices'][0]['message']['content']}\n")
            print(f"📦 Full Response Object:")
            print(json.dumps(result, indent=2))
            return True
        else:
            print(f"❌ FAILED! Status {response.status_code}")
            print(f"📄 Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError as e:
        print("❌ CONNECTION ERROR!")
        print(f"   {str(e)}\n")
        print("💡 Possible causes:")
        print("   1. SSH tunnel is not running")
        print("   2. Wrong port mapping (should be 8001:8000)")
        print("   3. vLLM server is not running on the remote machine\n")
        print("🔧 Fix: Run this command in a separate terminal:")
        print("   ssh -L 8001:localhost:8000 ra_aatmaj@129.10.156.97")
        return False
        
    except requests.exceptions.Timeout:
        print("❌ TIMEOUT ERROR!")
        print("   The request took longer than 30 seconds\n")
        print("💡 Possible causes:")
        print("   1. vLLM server is overloaded")
        print("   2. Model is not loaded")
        print("   3. Network issues")
        return False
        
    except requests.exceptions.RequestException as e:
        print(f"❌ REQUEST ERROR!")
        print(f"   {str(e)}")
        return False
        
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR!")
        print(f"   {str(e)}")
        return False

def test_a6000_connection():
    """Test A6000 Ollama connection for comparison"""
    print_header("🧪 Testing A6000 Ollama Connection (for comparison)")
    
    print(f"📡 Endpoint: {REMOTE_A6000_URL}")
    print(f"🤖 Model: {REMOTE_A6000_MODEL}")
    print(f"⏱️  Timeout: 30 seconds\n")
    
    try:
        print("🔄 Sending test request...")
        start_time = time.time()
        
        response = requests.post(
            REMOTE_A6000_URL,
            json={
                "model": REMOTE_A6000_MODEL,
                "prompt": "Say 'Hello from A6000!' and nothing else.",
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 50
                }
            },
            timeout=30
        )
        
        elapsed_time = time.time() - start_time
        
        print(f"📊 Status Code: {response.status_code}")
        print(f"⏱️  Response Time: {elapsed_time:.2f}s\n")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS! A6000 is responding correctly!\n")
            print(f"📝 Response:")
            print(f"   {result.get('response', 'No response')}\n")
            return True
        else:
            print(f"❌ FAILED! Status {response.status_code}")
            print(f"📄 Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError as e:
        print("❌ CONNECTION ERROR!")
        print(f"   {str(e)}\n")
        print("💡 SSH tunnel for A6000 is not running")
        print("🔧 Fix: Run this command in a separate terminal:")
        print("   ssh -L 5001:localhost:11434 ra_aatmaj@129.10.156.97")
        return False
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False

def test_streaming():
    """Test Blackwell streaming response"""
    print_header("🧪 Testing Blackwell Streaming")
    
    print(f"📡 Endpoint: {REMOTE_BLACKWELL_URL}")
    print(f"🌊 Stream: True\n")
    
    try:
        print("🔄 Sending streaming request...")
        start_time = time.time()
        
        response = requests.post(
            REMOTE_BLACKWELL_URL,
            json={
                "model": REMOTE_BLACKWELL_MODEL,
                "messages": [
                    {"role": "user", "content": "Count from 1 to 5."}
                ],
                "temperature": 0.2,
                "max_tokens": 50,
                "stream": True
            },
            timeout=30,
            stream=True
        )
        
        if response.status_code == 200:
            print("✅ Streaming connection established!\n")
            print("📝 Received chunks:")
            
            chunk_count = 0
            full_text = ""
            
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        if data_str.strip() == '[DONE]':
                            break
                        try:
                            chunk_data = json.loads(data_str)
                            if 'choices' in chunk_data:
                                delta = chunk_data['choices'][0].get('delta', {})
                                if 'content' in delta:
                                    content = delta['content']
                                    full_text += content
                                    chunk_count += 1
                                    print(f"   Chunk {chunk_count}: '{content}'")
                        except json.JSONDecodeError:
                            continue
            
            elapsed_time = time.time() - start_time
            print(f"\n✅ Streaming test successful!")
            print(f"📊 Total chunks: {chunk_count}")
            print(f"⏱️  Total time: {elapsed_time:.2f}s")
            print(f"📝 Full response: {full_text}")
            return True
        else:
            print(f"❌ FAILED! Status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False

def main():
    print("\n")
    print("╔" + "="*78 + "╗")
    print("║" + " "*20 + "BLACKWELL vLLM CONNECTION TEST" + " "*28 + "║")
    print("╚" + "="*78 + "╝")
    
    # Test Blackwell
    blackwell_ok = test_blackwell_connection()
    
    # Test A6000 for comparison
    a6000_ok = test_a6000_connection()
    
    # Test streaming if Blackwell works
    if blackwell_ok:
        streaming_ok = test_streaming()
    
    # Summary
    print_header("📊 TEST SUMMARY")
    
    print("Results:")
    print(f"  {'✅' if blackwell_ok else '❌'} Blackwell vLLM (localhost:8001)")
    print(f"  {'✅' if a6000_ok else '❌'} A6000 Ollama (localhost:5001)")
    if blackwell_ok:
        print(f"  {'✅' if streaming_ok else '❌'} Blackwell Streaming")
    
    print("\n")
    
    if blackwell_ok and a6000_ok:
        print("🎉 ALL TESTS PASSED! Both backends are working correctly!")
        print("\n💡 If the UI is still showing A6000 instead of Blackwell:")
        print("   1. Restart your Next.js development server")
        print("   2. Clear browser cache and hard reload (Ctrl+Shift+R)")
        print("   3. Check the server logs for 'Blackwell failed' messages")
        return 0
    elif blackwell_ok and not a6000_ok:
        print("⚠️  Blackwell works, but A6000 doesn't. This is fine if you only want to use Blackwell.")
        return 0
    elif not blackwell_ok and a6000_ok:
        print("⚠️  A6000 works, but Blackwell doesn't. This explains the fallback behavior!")
        print("\n🔧 Fix the Blackwell connection and restart the server.")
        return 1
    else:
        print("❌ Both backends failed! Check your SSH tunnels and server logs.")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
        sys.exit(1)

