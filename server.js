import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();  

const app = express();
app.use(cors(

)); 

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

let cachedToken = null;
let tokenExpiration = 0;

const getSpotifyToken = async () => {
    const now = Date.now();
    if (cachedToken && now < tokenExpiration) {
        return cachedToken; 
    }

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
        },
        body: "grant_type=client_credentials",
    });

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiration = now + data.expires_in * 1000; 

    return cachedToken;
};

app.get("/token", async (req, res) => {
    const token = await getSpotifyToken();
    res.json({ access_token: token });
});

const artistNames = ["Taylor Swift", "Sabrina Carpenter", "Ed Sheeran", "Olivia Rodrigo"];
app.get("/artists", async (req, res) => {
    const token = await getSpotifyToken();
    const artists = [];

    for (const name of artistNames) {
        const response = await axios.get(`https://api.spotify.com/v1/search`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { q: name, type: "artist", limit: 1 }
        });

        if (response.data.artists.items.length > 0) {
            const artist = response.data.artists.items[0];
            artists.push({
                id: artist.id,
                name: artist.name,
                image: artist.images.length > 0 ? artist.images[0].url : null,
                followers: artist?.followers?.total,
                link: artist?.external_urls?.spotify
            });
        }
    }

    res.json(artists);
});

app.get("/songs/:artistId", async (req, res) => {
    const token = await getSpotifyToken();
    const { artistId } = req.params;

    const artist = await axios.get(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    const response = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/top-tracks`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { market: "US" }
    });

    const shuffledTracks = response.data.tracks
    .map(track => ({ 
        name: track.name, 
        preview: track.preview_url, 
        image: track.album.images[0]?.url,
        is_playable: track.is_playable,
        album: track.album,
        artists: artist.data,
        external_urls: track?.external_urls?.spotify,
        uri: track?.uri
    }))
    .sort(() => Math.random() - 0.5);  // Reordenar aleatoriamente
    console.log("data:", response.data.tracks[0]);

    res.json(shuffledTracks);
});

app.get("/album/:albumId", async (req, res) => {
    const token = await getSpotifyToken();
    const { albumId } = req.params;

    try {
        const response = await axios.get(`https://api.spotify.com/v1/albums/${albumId}/tracks`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const albumTracks = response.data.items.map(track => ({
            name: track.name,
            preview: track.preview_url,
            duration_ms: track.duration_ms, 
            is_playable: track.is_playable, 
            artists: track.artists.map(artist => artist.name).join(", "), 
            album_image: track.album?.images[0]?.url 
        }));

        res.json(albumTracks);
    } catch (error) {
        console.error("Error al obtener las canciones del álbum:", error);
        res.status(500).json({ error: "Hubo un error al obtener las canciones del álbum" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎵 Server running on port ${PORT}`));
