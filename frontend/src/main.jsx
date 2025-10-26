import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
//import './index.css'
import App from './App.jsx'
import {Events} from "@wailsio/runtime";
import { HotkeysProvider } from "@/services/HotkeysContext.jsx";
import { UserSettingsProvider } from "@/services/UserSettingsContext.jsx";


createRoot(document.getElementById('root')).render(
  <StrictMode>
      <UserSettingsProvider>
          <HotkeysProvider>
              <App />
          </HotkeysProvider>
      </UserSettingsProvider>
  </StrictMode>,
)
