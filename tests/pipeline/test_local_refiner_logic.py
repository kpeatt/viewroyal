import pytest
from src.pipeline.ai_refiner import _merge_refinements, MeetingRefinement, AgendaItemRecord, MotionRecord

def test_merge_refinements():
    # Create mock refinements
    r1 = MeetingRefinement(
        summary="Summary 1",
        meeting_type="Regular Council",
        status="Completed",
        chair_person_name="Sid Tobias",
        attendees=["Sid Tobias", "Ron Mattson"],
        speaker_aliases=[{"label": "Speaker_01", "name": "Sid Tobias"}],
        transcript_corrections=[],
        items=[
            AgendaItemRecord(
                item_order="1", title="Call to Order", description="Start", 
                plain_english_summary="Start", category="Administration", tags=[], 
                financial_cost=None, funding_source=None, is_controversial=False, 
                debate_summary="Meeting started.", key_quotes=[], 
                discussion_start_time=0.0, discussion_end_time=10.0, motions=[]
            ),
            AgendaItemRecord(
                item_order="2", title="Public Participation", description="Public speaks", 
                plain_english_summary="Public speaks", category="Administration", tags=[], 
                financial_cost=None, funding_source=None, is_controversial=False, 
                debate_summary="Resident A spoke.", key_quotes=[], 
                discussion_start_time=15.0, discussion_end_time=None, motions=[]
            )
        ]
    )

    r2 = MeetingRefinement(
        summary="Summary 2",
        meeting_type="Regular Council",
        status="Completed",
        chair_person_name="Sid Tobias",
        attendees=["Sid Tobias", "Damian Kowalewich"],
        speaker_aliases=[{"label": "Speaker_02", "name": "Damian Kowalewich"}],
        transcript_corrections=[{"original_text": "Foo", "corrected_text": "Bar", "reason": "Typo"}],
        items=[
            AgendaItemRecord(
                item_order="2", title="Public Participation", description="Public speaks", 
                plain_english_summary="Public speaks", category="Administration", tags=[], 
                financial_cost=None, funding_source=None, is_controversial=False, 
                debate_summary="Resident B spoke.", key_quotes=[], 
                discussion_start_time=None, discussion_end_time=30.0, motions=[]
            ),
            AgendaItemRecord(
                item_order="3", title="Bylaw 123", description="New Bylaw", 
                plain_english_summary="New Bylaw", category="Bylaws", tags=[], 
                financial_cost=None, funding_source=None, is_controversial=True, 
                debate_summary="Debate on bylaw.", key_quotes=[], 
                discussion_start_time=35.0, discussion_end_time=60.0, motions=[
                    MotionRecord(motion_text="Read first time", result="CARRIED")
                ]
            )
        ]
    )

    merged = _merge_refinements([r1, r2])

    assert merged is not None
    assert "Ron Mattson" in merged.attendees
    assert "Damian Kowalewich" in merged.attendees
    assert len(merged.speaker_aliases) == 2
    assert len(merged.transcript_corrections) == 1
    
    assert len(merged.items) == 3 # Call to Order, Public Participation, Bylaw 123
    
    # Check merged item (Public Participation)
    pp_item = next(i for i in merged.items if i.title == "Public Participation")
    assert "Resident A spoke." in pp_item.debate_summary
    assert "Resident B spoke." in pp_item.debate_summary
    assert pp_item.discussion_start_time == 15.0
    assert pp_item.discussion_end_time == 30.0
    
    # Check new item
    bylaw_item = next(i for i in merged.items if i.title == "Bylaw 123")
    assert len(bylaw_item.motions) == 1
    assert bylaw_item.is_controversial is True
