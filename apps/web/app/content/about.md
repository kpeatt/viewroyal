# About ViewRoyal.ai

A specialized intelligence platform designed to make local government accessible, transparent, and searchable for the citizens of View Royal.

> This is an independent, non-partisan project. It is not an official Town of View Royal service, but it uses official Town data to provide a better window into our local democracy.

## Why I Built This

My name is Kyle. I moved to View Royal in 2021. I've worked in user experience my whole life. Most recently, I was the Head of Design at Shopify. I love building things that help people — especially in cases where the problem is solvable through a better experience.

Since I plan on calling View Royal home for the rest of my life, I wanted to get a better sense of how the town operates. I am especially interested in understanding how it will grow and change. I started watching more town council meetings and eventually got frustrated with the difficulty of following each meeting. The minutes get posted but they aren't usually the whole picture. I was interested in the small details. What council members debate and what they stand for. I started this for my own interest but realized it could be useful for everyone.

I hope this project will help the people of View Royal understand how their council works for them and make more informed decisions about their future.

## How It Works

*   **Automated Scraping:** Regularly monitors the View Royal website for new agendas, minutes, and bylaws.
*   **Meeting Analysis:** The agenda and minutes files are parsed to extract relevant information and run through Google's Gemini API to generate summaries and insights. This helps identify key topics and trends in the meetings. The summaries are then stored in a database for future reference.
*   **Transcription** For meetings with videos, downloads the audio from the meeting and transcribes it using local models.
*   **AI Diarization:** Uses local models to separate speakers in meeting audio and combines that with manual verification for accuracy.
*   **Vector Search:** Every agenda item, transcript segment and motion is embedded into a high-dimensional vector space for semantic search.

## Questions

### Are you trying to make a statement?
No. This is purely meant to be a tool for transparency and accountability. None of the data is intended to be used for any other purpose. I have worked hard to make sure the analysis done by this tool is non-partisan and neutral.

### Can I trust the accuracy of the data?
I hope so! I have worked hard to ensure the accuracy of the data by using multiple models and manual verification. That said, there may be errors or omissions in the data. If you find any errors or have suggestions for improvement, please let me know. The official View Royal website should always be the final authority.

### What is the data used for?
The data is used to provide a comprehensive understanding of the council's activities and decisions. It can be used to analyze trends, identify patterns, and make informed decisions about the future of the community. This project will never have advertising or be used for profit.

### My personal information is on here and I want to delete it.
Not a question but fair enough! Send me an email at [kyle@viewroyal.ai](mailto:kyle@viewroyal.ai) and I will make sure your information is anonymized. You can also request a copy of your data by sending an email to [kyle@viewroyal.ai](mailto:kyle@viewroyal.ai). Any data that is on this site was collected from the official View Royal website and Vimeo videos so redacting it here will not remove the original source. 

### Who is paying for this?
Just me. If you want to support the project, feel free to email me with some ideas.

---

### Interested in the code or want to help?
ViewRoyal.ai is open to collaboration and feedback.
Contact: [kyle@viewroyal.ai](mailto:kyle@viewroyal.ai)
