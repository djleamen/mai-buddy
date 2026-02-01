/**
 * User-specific configuration for Mai Buddy AI assistant.
 * Defines personal details, interests, and learning style.
 * 
 * Author: DJ Leamen, 2025-2026
 */

const userConfig = {
  personal: {
    name: 'Your Name',
    location: 'City, State/Province, Country',
    education: 'Your education details',
    work: ['Your work experience'],
    careerGoal: 'Your career goals'
  },
  interests: {
    sports: ['Favorite sports teams'],
    music: {
      genres: ['Favorite music genres'],
      bands: ['Favorite bands']
    },
    entertainment: {
      movies: ['Favorite movies'],
      tvShows: ['Favorite TV shows'],
      books: ['Favorite books']
    }
  },
  learningStyle: 'Your preferred learning style'
};

module.exports = { userConfig };
