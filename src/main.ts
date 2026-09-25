import './style.css'
import { Game } from './game/game.ts'
import { preloadModels } from './game/models.ts'

preloadModels()
  .then(() => new Game())
  .catch((err) => {
    console.error(err)
    document.body.textContent = 'The models failed to load. Refresh the page.'
  })
