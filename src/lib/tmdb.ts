type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export interface CardData {
  id: string;
  rarity: Rarity;
  name: string;
  description: string;
  poster: string;
  rating: number;
  trailer?: string;
  imdb_link?: string;
  year?: number;
  type: "movie" | "tv";
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const getRarityByRating = (rating: number): Rarity => {
  if (rating >= 8.5) return "Legendary";
  if (rating >= 7.5) return "Epic";
  if (rating >= 6.5) return "Rare";
  if (rating >= 5.5) return "Uncommon";
  return "Common";
};

export const fetchRandomPack = async (count: number = 5): Promise<CardData[]> => {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) {
    console.error("TMDB API Key missing. Please set NEXT_PUBLIC_TMDB_API_KEY in .env.local");
    return [];
  }

  try {
    const movieResults: any[] = [];
    
    // We'll fetch from both movies and tv shows
    // We determine how many pages we need roughly. 
    // Since each page has 20, count/20 is usually 1, but we fetch more to have variety.
    const pagesPerType = Math.max(1, Math.ceil(count / 10)); 

    const fetchItems = async (type: 'movie' | 'tv', pages: number) => {
      const usedPages = new Set<number>();
      while (usedPages.size < pages) {
        // TMDB allows up to 500 pages for most requests
        const randomPage = Math.floor(Math.random() * 500) + 1;
        usedPages.add(randomPage);
      }

      const responses = await Promise.all(
        Array.from(usedPages).map(page =>
          fetch(`${TMDB_BASE_URL}/${type}/popular?api_key=${apiKey}&language=en-US&page=${page}`)
            .then(res => res.ok ? res.json() : { results: [] })
        )
      );

      return responses.flatMap(data => (data.results || []).map((item: any) => ({ ...item, media_type: type })));
    };

    const [movies, tvShows] = await Promise.all([
      fetchItems('movie', pagesPerType),
      fetchItems('tv', pagesPerType)
    ]);

    const allResults = [...movies, ...tvShows];
    if (allResults.length === 0) return [];

    // 1. Deduplicate the pool based on ID and type to prevent "same numbers"
    const uniqueMap = new Map();
    allResults.forEach(item => {
      const uniqueId = `${item.media_type}-${item.id}`;
      if (!uniqueMap.has(uniqueId)) {
        uniqueMap.set(uniqueId, item);
      }
    });
    
    const uniquePool = Array.from(uniqueMap.values());

    // 2. Fisher-Yates Shuffle for true unbiased randomness
    for (let i = uniquePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniquePool[i], uniquePool[j]] = [uniquePool[j], uniquePool[i]];
    }

    // 3. Pick exactly `count` or as many as available
    const selectedItems = uniquePool.slice(0, Math.min(count, uniquePool.length));

    // Enrich with extra details in parallel
    const enrichedItems: CardData[] = await Promise.all(
      selectedItems.map(async (item: any): Promise<CardData> => {
        const type = item.media_type;
        let trailerUrl = "";
        let imdbId = "";

        // Fetch videos
        try {
          const videoRes = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}/videos?api_key=${apiKey}&language=en-US`);
          if (videoRes.ok) {
            const videoData = await videoRes.json();
            const trailer = videoData.results.find((vid: any) => vid.type === "Trailer" && vid.site === "YouTube");
            if (trailer) {
              trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
            }
          }
        } catch (e) { console.error(e) }

        // Fetch external IDs
        try {
          const extRes = await fetch(`${TMDB_BASE_URL}/${type}/${item.id}/external_ids?api_key=${apiKey}`);
          if (extRes.ok) {
            const extData = await extRes.json();
            if (extData.imdb_id) {
              imdbId = `https://www.imdb.com/title/${extData.imdb_id}`;
            }
          }
        } catch (e) { console.error(e) }

        let year: number | undefined;
        const dateStr = item.release_date || item.first_air_date;
        if (dateStr) {
          year = parseInt(dateStr.split('-')[0], 10);
        }

        return {
          id: `${type}-${item.id}`, // Prefix with type to avoid ID collisions
          rarity: getRarityByRating(item.vote_average ?? 0),
          name: item.title || item.name || item.original_title || item.original_name,
          description: item.overview,
          poster: item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : "",
          rating: item.vote_average ?? 0,
          trailer: trailerUrl,
          imdb_link: imdbId,
          year: year,
          type: type,
        };
      })
    );

    // Sort by rarity
    const rarityOrder: Record<Rarity, number> = {
      Common: 0,
      Uncommon: 1,
      Rare: 2,
      Epic: 3,
      Legendary: 4,
    };

    return enrichedItems.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

  } catch (error) {
    console.error("Error fetching TMDB data:", error);
    return [];
  }
};

