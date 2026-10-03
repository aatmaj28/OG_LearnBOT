"""Meeting Minutes Agent: turns a meeting transcript into structured minutes.

    summarize(title, attendees:[str], transcript)
      -> {summary, decisions:[], action_items:[{owner,task,due}], notes:[], open_questions:[]}

SKELETON: returns realistic sample minutes. The map-reduce version lands on AJ.
"""


def summarize(title, attendees, transcript) -> dict:
    owner = attendees[0] if attendees else "Unassigned"
    return {
        "summary": f"{title}: the team agreed the demo flow (connect repo → ask a question → learn → manager "
                   "report) and split the remaining work for tomorrow.",
        "decisions": ["Use OG_LearnBOT as the demo project.", "Freeze CONTRACTS.md; changes go through AJ."],
        "action_items": [
            {"owner": owner, "task": "Push the skeleton to the AJ branch", "due": "today"},
            {"owner": attendees[1] if len(attendees) > 1 else owner, "task": "Record the voice demo", "due": "tomorrow"},
        ],
        "notes": ["Backend never calls the voice service; the browser does.", "Everything runs on the GB10."],
        "open_questions": ["Do we need Hindi transcription for the live demo?"],
    }
