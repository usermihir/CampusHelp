import logging
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.models import Item, Match, ItemStatus, ItemType

logger = logging.getLogger(__name__)

async def find_candidates(db: AsyncSession, item_id: UUID):
    try:
        # Fetch the newly inserted item
        result = await db.execute(select(Item).where(Item.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            logger.error(f"Item {item_id} not found for matching.")
            return

        if item.status != ItemStatus.active:
            return

        opposite_type = ItemType.found if item.type == ItemType.lost else ItemType.lost

        # Using pg_trgm similarity
        query_text = f"{item.title} {item.description or ''}".strip()
        
        # In a real asyncpg/SQLAlchemy setup, we can use the text() construct for the raw SQL
        # We want to find top 5 matches with similarity > 0.3
        
        sql = text("""
            SELECT
                id,
                similarity(title || ' ' || coalesce(description, ''), :query_text) AS score
            FROM items
            WHERE type = :opposite_type
              AND status = 'active'
              AND category = :category
              AND (title || ' ' || coalesce(description, '')) % :query_text
            ORDER BY score DESC
            LIMIT 5;
        """)
        
        # We also need to set pg_trgm.similarity_threshold before the query
        await db.execute(text("SET pg_trgm.similarity_threshold = 0.3;"))
        
        result = await db.execute(sql, {
            "query_text": query_text,
            "opposite_type": opposite_type.value,
            "category": item.category
        })
        
        candidates = result.all()
        
        for candidate in candidates:
            candidate_id = candidate.id
            score = candidate.score
            
            lost_id = item.id if item.type == ItemType.lost else candidate_id
            found_id = candidate_id if item.type == ItemType.lost else item.id
            
            # Insert into matches
            # The UNIQUE constraint will handle duplicates if we use PostgreSQL ON CONFLICT
            # Since SQLAlchemy doesn't easily do ON CONFLICT without dialetcs, we use insert...on conflict
            insert_sql = text("""
                INSERT INTO matches (lost_item_id, found_item_id, similarity_score, status)
                VALUES (:lost_id, :found_id, :score, 'proposed')
                ON CONFLICT (lost_item_id, found_item_id) DO NOTHING
            """)
            await db.execute(insert_sql, {
                "lost_id": lost_id,
                "found_id": found_id,
                "score": score
            })
            
        await db.commit()
        logger.info(f"Processed matching for item {item_id}. Found {len(candidates)} candidates.")
        
    except Exception as e:
        logger.error(f"Error in find_candidates: {e}")
        await db.rollback()
