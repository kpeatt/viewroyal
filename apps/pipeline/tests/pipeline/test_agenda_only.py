import json
from unittest.mock import MagicMock, patch

from pipeline.ingestion.ai_refiner import refine_meeting_data

def test_agenda_only_refinement():
    agenda_text = """
    TOWN OF VIEW ROYAL
    COUNCIL MEETING
    AGENDA
    Tuesday, January 20, 2026

    1. CALL TO ORDER
    2. APPROVAL OF AGENDA
       Recommendation: THAT the agenda be approved.
    3. REPORTS
       3.1 Staff Report - Bridge Repair
       Recommendation: THAT the budget be approved.
    4. ADJOURNMENT
    """
    
    # Mock the Gemini client to return a predictable response
    # effectively simulating what the "Agenda Only" prompt would return
    mock_response = MagicMock()
    mock_response.parsed = {
        "summary": "Scheduled meeting to discuss Bridge Repair.",
        "meeting_type": "Regular Council",
        "status": "Planned",
        "chair_person_name": None,
        "attendees": [],
        "speaker_aliases": [],
        "transcript_corrections": [],
        "items": [
            {
                "item_order": "1",
                "title": "CALL TO ORDER",
                "category": "Administrative",
                "tags": [],
                "is_controversial": False,
                "motions": []
            },
            {
                "item_order": "3.1",
                "title": "Staff Report - Bridge Repair",
                "category": "Infrastructure",
                "tags": [],
                "is_controversial": False,
                "motions": []
            }
        ]
    }

    with patch("pipeline.ingestion.ai_refiner.client") as mock_client:
        mock_client.models.generate_content.return_value = mock_response
        
        # Call with only Agenda
        result = refine_meeting_data(agenda_text, "", "")
        
        # Verify the prompt used was the "Agenda Only" one (we can infer this by checking logic or just checking result)
        # But specifically, we want to ensure the function ran without error and handled the empty inputs
        
        print("Result Status:", result["status"])
        print("Items Found:", len(result["items"]))
        print("Motions in Item 1:", result["items"][1]["motions"])

        if result["status"] == "Planned" and len(result["items"][1]["motions"]) == 0:
            print("SUCCESS: Agenda Only mode correctly simulated.")
        else:
            print("FAILURE: Unexpected output.")

if __name__ == "__main__":
    test_agenda_only_refinement()
