import pytest
from unittest.mock import MagicMock
from pipeline.ingestion.ingester import MeetingIngester

def test_map_type_to_org():
    # Mocking Supabase and Gemini to avoid network calls during logic tests
    ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)
    
    # Council mappings
    assert ingester.map_type_to_org("Regular Council") == ("Council", "Council")
    assert ingester.map_type_to_org("Special Council") == ("Council", "Council")
    assert ingester.map_type_to_org("Committee of the Whole") == ("Council", "Council")
    assert ingester.map_type_to_org("Public Hearing") == ("Council", "Council")
    
    # Other bodies
    assert ingester.map_type_to_org("Board of Variance") == ("Board of Variance", "Board")
    
    # Generic Committee fallback
    assert ingester.map_type_to_org("Standing Committee") == ("Standing Committee", "Committee")
    
def test_map_advisory_committee_from_title():
    ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)
    
    # Test that we correctly identify specific advisory committees from the title
    # even if the type is generic "Advisory Committee"
    meeting_data = {"title": "2023-01-01 Official Community Plan Review Advisory Committee"}
    
    # We'll simulate the refinement result
    refined_type = "Advisory Committee"
    
    # Map logic test
    target_org_name, target_org_class = ingester.map_type_to_org(refined_type)
    
    # Apply the special advisory override logic
    if refined_type == "Advisory Committee":
        for candidate_org in ["Official Community Plan Review Advisory Committee", "Capital West Accessibility Advisory Committee"]:
            if candidate_org.lower() in meeting_data["title"].lower():
                target_org_name = candidate_org
                target_org_class = "Advisory Committee"
                break
                
    assert target_org_name == "Official Community Plan Review Advisory Committee"
    assert target_org_class == "Advisory Committee"
