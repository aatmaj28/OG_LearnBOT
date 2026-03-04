#!/usr/bin/env python3
"""
Test script to verify grading brackets implementation
"""

import json
import sys
import os

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agents import get_prompt

def test_grading_brackets():
    """Test the grading brackets functionality"""
    
    # Test data
    criteria_prompts = [
        {
            "criterionName": "Test Criterion",
            "prompt": {
                "header": "**Test Criterion (Max: 25 points)**",
                "introduction": "Check if the essay meets these requirements:",
                "instructions": [
                    "Evaluate the essay based on this criterion",
                    "Check for specific requirements"
                ]
            }
        }
    ]
    
    # Test case 1: With valid grading brackets
    print("=== Test Case 1: Valid Grading Brackets ===")
    valid_brackets = [
        {
            "label": "Excellent",
            "range": "90-100",
            "expectation": "Outstanding performance demonstrating thorough understanding"
        },
        {
            "label": "Good",
            "range": "75-89",
            "expectation": "Strong performance with good understanding"
        },
        {
            "label": "Satisfactory",
            "range": "60-74",
            "expectation": "Adequate performance with basic understanding"
        }
    ]
    
    try:
        result = get_prompt(
            criteria_prompts=criteria_prompts,
            tone="moderate",
            quality_multiplier=1.0,
            specificity_score=0.5,
            has_supporting_docs=False,
            grading_brackets=valid_brackets
        )
        
        if result and "criteria_prompts" in result:
            prompt = result["criteria_prompts"]["Test Criterion"]["prompt"]
            print("✅ Valid brackets test passed")
            print("Prompt contains brackets section:", "SCORING BRACKETS FOR THIS CRITERION:" in prompt)
            print("Prompt contains bracket instructions:", "BRACKET-BASED GRADING INSTRUCTIONS:" in prompt)
        else:
            print("❌ Valid brackets test failed - no result")
            
    except Exception as e:
        print(f"❌ Valid brackets test failed with error: {e}")
    
    # Test case 2: With old format brackets (no expectation field)
    print("\n=== Test Case 2: Old Format Brackets (No Expectation) ===")
    old_brackets = [
        {
            "label": "Excellent",
            "range": "90-100"
        },
        {
            "label": "Good",
            "range": "75-89"
        }
    ]
    
    try:
        result = get_prompt(
            criteria_prompts=criteria_prompts,
            tone="moderate",
            quality_multiplier=1.0,
            specificity_score=0.5,
            has_supporting_docs=False,
            grading_brackets=old_brackets
        )
        
        if result and "criteria_prompts" in result:
            prompt = result["criteria_prompts"]["Test Criterion"]["prompt"]
            print("✅ Old format brackets test passed")
            print("Prompt contains brackets section:", "SCORING BRACKETS FOR THIS CRITERION:" in prompt)
        else:
            print("❌ Old format brackets test failed - no result")
            
    except Exception as e:
        print(f"❌ Old format brackets test failed with error: {e}")
    
    # Test case 3: No brackets provided (should use defaults)
    print("\n=== Test Case 3: No Brackets (Should Use Defaults) ===")
    
    try:
        result = get_prompt(
            criteria_prompts=criteria_prompts,
            tone="moderate",
            quality_multiplier=1.0,
            specificity_score=0.5,
            has_supporting_docs=False,
            grading_brackets=None
        )
        
        if result and "criteria_prompts" in result:
            prompt = result["criteria_prompts"]["Test Criterion"]["prompt"]
            print("✅ No brackets test passed")
            print("Prompt contains brackets section:", "SCORING BRACKETS FOR THIS CRITERION:" in prompt)
        else:
            print("❌ No brackets test failed - no result")
            
    except Exception as e:
        print(f"❌ No brackets test failed with error: {e}")
    
    # Test case 4: Invalid brackets format
    print("\n=== Test Case 4: Invalid Brackets Format ===")
    invalid_brackets = [
        "Not a dict",
        {"invalid": "format"},
        None
    ]
    
    try:
        result = get_prompt(
            criteria_prompts=criteria_prompts,
            tone="moderate",
            quality_multiplier=1.0,
            specificity_score=0.5,
            has_supporting_docs=False,
            grading_brackets=invalid_brackets
        )
        
        if result and "criteria_prompts" in result:
            prompt = result["criteria_prompts"]["Test Criterion"]["prompt"]
            print("✅ Invalid brackets test passed (should handle gracefully)")
            print("Prompt contains brackets section:", "SCORING BRACKETS FOR THIS CRITERION:" in prompt)
        else:
            print("❌ Invalid brackets test failed - no result")
            
    except Exception as e:
        print(f"❌ Invalid brackets test failed with error: {e}")

if __name__ == "__main__":
    test_grading_brackets() 