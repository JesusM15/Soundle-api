import axios from 'axios';

async function test() {
    try {
        const artists = await axios.get('http://localhost:3000/artists');
        const taylor = artists.data.find(a => a.name === 'Taylor Swift');
        
        console.log('Fetching songs for Taylor (Expanded Discography)...');
        const songsRes = await axios.get(`http://localhost:3000/songs/${taylor.id}`);
        const songs = songsRes.data;
        console.log('Total unique songs returned by API:', songs.length);
        console.log('Sample of songs:', songs.slice(0, 50).map(s => `${s.name} - Album: ${s.album}`));

    } catch (e) {
        console.error('Error during test:', e.message);
    }
}

test();
