import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import https from "https";

dotenv.config();

const app = express();
app.use(cors());

const DEEZER_URL = "https://api.deezer.com";
const secretMap = {};
const trackCache = {}; // Cache: artistId -> tracks[], avoids re-fetching on every game

const artistNames = [
    "Taylor Swift", "Sabrina Carpenter", "Justin Bieber", "Ariana Grande", "BTS",
    "Queen", "The Beatles", "Michael Jackson", "Doblecero", "Junior H",
    "Radiohead", "David Bowie", "Geese", "The Velvet Underground"
];

// Helper to fetch Deezer artist data by name
const getDeezerArtist = async (name) => {
    try {
        const response = await axios.get(`${DEEZER_URL}/search/artist`, {
            params: { q: name }
        });
        if (response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
        }
        return null;
    } catch (error) {
        console.error(`Error fetching artist ${name}:`, error.message);
        return null;
    }
};

// Normalize album name — strips edition markers so yellow hint works across versions
const normalizeAlbum = (title) => (title || "Unknown Album")
    .replace(/\s*\((Taylor's Version|Deluxe|Standard|Platinum|Special|Digital|Expanded|Anniversary|Collector|3am Edition|Til Dawn Edition|The Anthology)[^)]*\)/gi, "")
    .replace(/\s*(Taylor's Version)/gi, "")
    .trim();

// Normalize song title — strips remaster/live/version suffixes for de-duplication
const normalizeSongTitle = (title) => title
    .toLowerCase()
    .replace(/\s*-\s*(remaster(ed)?|live|mono|stereo|single|edit|version|mix|take|demo|acoustic|radio|original|anniversary|\d{4}.*).*$/i, "")
    .replace(/\s*\((remaster(ed)?|live|mono|stereo|single|edit|version|mix|take|demo|acoustic|radio|original|anniversary|\d{4}.*).*\)/i, "")
    .trim();

// Fetch top 50 most popular tracks (ordered by Deezer popularity)
const getArtistTracks = async (artistId, artistName) => {
    try {
        const response = await axios.get(`${DEEZER_URL}/artist/${artistId}/top`, {
            params: { limit: 60 } // Fetch 60 to account for any that lack previews
        });

        const uniqueTracksMap = new Map();
        response.data.data.forEach(track => {
            const key = normalizeSongTitle(track.title);
            if (!uniqueTracksMap.has(key)) {
                uniqueTracksMap.set(key, {
                    id: track.id,
                    name: track.title,
                    src: track.preview || null,
                    artist: artistName,
                    album: normalizeAlbum(track.album?.title)
                });
            }
        });

        return Array.from(uniqueTracksMap.values());
    } catch (error) {
        console.error(`Error fetching tracks for ${artistName}:`, error.message);
        return [];
    }
};

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get("/token", (req, res) => {
    res.json({ access_token: "deezer_public_access" });
});

app.get("/artists", async (req, res) => {
    const artists = [];
    for (const name of artistNames) {
        const artist = await getDeezerArtist(name);
        if (artist) {
            artists.push({
                id: artist.id,
                name: artist.name,
                image: artist.picture_medium,
                followers: artist.nb_fan,
                link: artist.link,
                images: [{ url: artist.picture_medium }]
            });
        }
    }
    res.json(artists);
});

app.get("/songs/:artistId", async (req, res) => {
    const { artistId } = req.params;
    try {
        if (trackCache[artistId]) {
            return res.json(trackCache[artistId]);
        }
        const artistRes = await axios.get(`${DEEZER_URL}/artist/${artistId}`);
        const tracks = await getArtistTracks(artistId, artistRes.data.name);
        trackCache[artistId] = tracks;
        res.json(tracks);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener canciones" });
    }
});

app.get("/secret_song/:artistId", async (req, res) => {
    const { artistId } = req.params;
    try {
        let tracks = trackCache[artistId];
        if (!tracks) {
            const artistRes = await axios.get(`${DEEZER_URL}/artist/${artistId}`);
            tracks = await getArtistTracks(artistId, artistRes.data.name);
            trackCache[artistId] = tracks;
        }

        const validTracks = tracks.filter(t => t.src);
        if (validTracks.length === 0) {
            return res.status(404).json({ error: "No hay canciones disponibles." });
        }

        const secretSong = validTracks[Math.floor(Math.random() * validTracks.length)];
        const secretId = crypto.randomBytes(6).toString("hex");

        secretMap[secretId] = {
            preview_url: secretSong.src,
            artist: secretSong.artist
        };

        res.json({ secretId, song: secretSong });
    } catch (error) {
        res.status(500).json({ error: "Error al obtener canción secreta" });
    }
});

app.get("/audio/secret/:id", async (req, res) => {
    const { id } = req.params;
    const entry = secretMap[id];
    if (!entry) {
        return res.status(404).json({ error: "Audio no encontrado o expirado." });
    }

    https.get(entry.preview_url, (audioRes) => {
        res.setHeader("Content-Type", "audio/mpeg");
        audioRes.pipe(res);
    }).on("error", (err) => {
        console.error("Error al reenviar audio:", err.message);
        res.status(500).json({ error: "Error al reenviar audio" });
    });
});

app.get("/artist/:artistId", async (req, res) => {
    const { artistId } = req.params;
    try {
        const response = await axios.get(`${DEEZER_URL}/artist/${artistId}`);
        const artist = response.data;
        res.json({
            ...artist,
            images: [{ url: artist.picture_medium }]
        });
    } catch (error) {
        res.status(500).json({ error: "Error al obtener artista" });
    }
});

app.get("/album/:albumId", async (req, res) => {
    const { albumId } = req.params;
    try {
        const response = await axios.get(`${DEEZER_URL}/album/${albumId}/tracks`);
        const albumTracks = response.data.data.map(track => ({
            name: track.title,
            preview: track.preview,
            duration_ms: track.duration * 1000,
            artist: track.artist?.name,
        }));
        res.json(albumTracks);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener canciones del álbum" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
