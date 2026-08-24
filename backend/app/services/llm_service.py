from openai import OpenAI
from app.core.config import settings

def get_hf_client():
    if not settings.HF_API_KEY:
        raise ValueError("HF_API_KEY is not set in environment variables.")
    return OpenAI(
        base_url="https://router.huggingface.co/v1",
        api_key=settings.HF_API_KEY,
    )

def generate_user_profile(profile_data: dict) -> str:
    """
    Generate a short, friendly third-person profile using Hugging Face LLM.
    """
    client = get_hf_client()
    
    # Format the profile data into a readable string
    profile_str = "\n".join([f"{k}: {v}" for k, v in profile_data.items()])
    
    prompt = f"""
Create a short, friendly third-person profile for a college roommate matching platform.

Use ONLY the information provided below.
Do NOT invent any information.
Write 2-3 natural sentences.

Profile:
{profile_str}
"""
    
    completion = client.chat.completions.create(
        model="Qwen/Qwen2.5-0.5B-Instruct:featherless-ai",
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=150,
        temperature=0.7,
    )
    
    return completion.choices[0].message.content.strip()

def generate_match_summary(viewer_data: dict, candidate_data: dict) -> str:
    """
    Generate a compatibility summary explaining why two students might be compatible.
    """
    client = get_hf_client()
    
    viewer_str = "\n".join([f"{k}: {v}" for k, v in viewer_data.items() if k not in ('id', 'user_id', 'feature_vector')])
    candidate_str = "\n".join([f"{k}: {v}" for k, v in candidate_data.items() if k not in ('id', 'user_id', 'feature_vector')])
    
    prompt = f"""
You are summarizing why two students might be compatible roommates, based on their questionnaire answers.
Be concise (3-4 sentences), balanced, and mention both alignment points and any differences worth knowing.
Address the viewer as 'You' and the candidate in third person.

Your Profile (Viewer):
{viewer_str}

Candidate's Profile:
{candidate_str}
"""

    completion = client.chat.completions.create(
        model="Qwen/Qwen2.5-0.5B-Instruct:featherless-ai",
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=200,
        temperature=0.7,
    )
    
    return completion.choices[0].message.content.strip()
