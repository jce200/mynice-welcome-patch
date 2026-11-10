#!/usr/bin/env python3
"""Combines tokens.css + skin.css + status.css + activity.css + m3e.css (with icons, shapes, waves and the loading indicator filled in) into ../nx-expressive.css
(what patch-10-skin.py puts in the app)."""
import json, math, os, re, urllib.parse, glob
HERE = os.path.dirname(os.path.abspath(__file__))
ICON_PATHS = {  # Material icons, 24x24
 'star': 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
 'home': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
 'settings': 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
 'chevron': 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
 'arrow-back': 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
 'visibility': 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
 'arrow-up': 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
 'arrow-down': 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
 'stop': 'M6 6h12v12H6z',
 'play': 'M8 5v14l11-7z',
 'gate': 'M4 4h2v15H4zM18 4h2v15h-2zM7.5 7h9v2h-9zm0 4h9v2h-9zm0 4h9v2h-9zM2 20h20v2H2z',
 'wifi': 'M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z',
 'wifi-off': 'M12 4.5c3.1 0 6 .96 8.36 2.6l1.5-1.5C19.12 3.7 15.67 2.5 12 2.5S4.88 3.7 2.14 5.6l1.5 1.5A14.5 14.5 0 0 1 12 4.5zM2.81 2.81 1.39 4.22l2.72 2.72C2.7 7.9 1.43 8.9 1 9l2 2c.76-.76 1.6-1.4 2.5-1.93l2.07 2.07C6.7 11.7 5.9 12.3 5 13l2 2c.7-.7 1.5-1.2 2.4-1.5l2.4 2.4-.8.6 3 3 .8-.8 5.4 5.4 1.41-1.41L2.81 2.81z',
 'cloud': 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
 'vpn-key': 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
 'cell': 'M17 4h3v16h-3zM5 14h3v6H5zm6-5h3v11h-3z',
 'check': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
 'warning': 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
 'error': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
 'refresh': 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
 'group': 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
 'copy': 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
 'close': 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
 'bug': 'M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z',
 'phone': 'M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
 'route': 'M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
 'add': 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
 'expand': 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
 'tune': 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
 'done': 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
 'lock': 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
 'lock-open': 'M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z',  # nx23 (activity): not blocked
 'favorite': 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
 'share': 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z',
 'edit': 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
 'delete': 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
 'search': 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
 'menu': 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
 'more': 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
 'bold': 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
 'italic': 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z',
 'underline': 'M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z',
 'list': 'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
 'palette': 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
 'pause': 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
 'next': 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
 'previous': 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
 'bookmark': 'M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z',
 'like': 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
 'link': 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
 'undo': 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
 'redo': 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
 'sun': 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z',
 'moon': 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z',
 'bell': 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
 'person': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
 'mail': 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
 'history': 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
}
def uri(path):
    svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='%s'/></svg>" % path
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="/:=' <>") .replace('<', '%3C').replace('>', '%3E').replace(' ', '%20') + '")'
icons = '\n  '.join('--nx-i-%s: %s;' % (k, uri(v)) for k, v in ICON_PATHS.items())
shapes = json.load(open(os.path.join(HERE, 'shapes.json')))


def wave_uri(wavelength, periods=5, amp=3.0, thick=4.0, height=10.0):
    """The wave of the wavy progress indicator as a mask: a sine of `amp` dp that is `thick` dp thick, `periods` waves wide, in cubic Bezier half-waves (the control points
    (0.412 L, 1.337 A) and (0.588 L, 1.337 A) of a half-wave of length L follow a sine with an error below 0.3 % of the amplitude). The path goes half a wave beyond the tile at both
    ends, so that the stroke is closed at the edge of the tile and the tiles join without a seam."""
    half = wavelength / 2.0
    c, h = 0.412, 1.337
    mid = height / 2.0
    n = periods * 2 + 2
    d = ['M%g,%g' % (-half, mid)]
    for k in range(n):
        x0 = -half + k * half
        sign = -1 if k % 2 == 0 else 1
        d.append('C%g,%g,%g,%g,%g,%g' % (x0 + c * half, mid + sign * h * amp, x0 + (1 - c) * half, mid + sign * h * amp, x0 + half, mid))
    width = periods * wavelength
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' width='%g' height='%g' viewBox='0 0 %g %g'><path d='%s' fill='none' stroke='black' stroke-width='%g'/></svg>"
           % (width, height, width, height, ''.join(d), thick))
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="/:=' ,.") .replace(' ', '%20').replace('<', '%3C').replace('>', '%3E') + '")'


# the seven shapes of the loading indicator, in the order of LoadingIndicator.kt (IndeterminateIndicatorPolygons); every step the shape turns another 90 degrees,
# the loop has 28 steps (7 shapes x 4 turns) so that it ends where it began
LOADER_SEQ = ['softburst', 'cookie9', 'pentagon', 'pill', 'sunny', 'cookie4', 'oval']
LOADER_STEPS = 28


def loader_keyframes():
    missing = [n for n in LOADER_SEQ if n not in shapes]
    if missing:
        raise SystemExit('shapes.json lacks the shapes of the loading indicator: %s' % ', '.join(missing))
    frames = []
    for i in range(LOADER_STEPS + 1):
        pct = ('%.4f' % (100.0 * i / LOADER_STEPS)).rstrip('0').rstrip('.')
        frames.append('  %s%% { clip-path: var(--nx-v-%s); transform: rotate(%ddeg); }' % (pct, LOADER_SEQ[i % len(LOADER_SEQ)], 90 * i))
    return '@keyframes m3e-morph {\n' + '\n'.join(frames) + '\n}'


def read(name):
    path = os.path.join(HERE, name)
    return open(path, encoding='utf-8').read() if os.path.exists(path) else ''


# The elements of the app that get the behaviour of an M3E button by selector (the state layer, the corners that morph when pressed, the springs); skin.css gives each of them its
# size, shape and colors with the variables of m3e.css (--_h, --_pad, --_gap, --_icon, --_sq, --_pr, --_bg, --_fg ...). The gallery uses the classes .m3e-btn and .m3e-icon-btn.
BUTTONS = ['.m3e-btn', '.m3e-icon-btn', '.device-commands .command', '.start-commands .command', '.bar .button', '.button', '.nx-seg-btn', '.nx-extra-edit', '#nx-log-button',
           '.nx-sheet button']

# nx23: one line per workstream for the selectors of NEW buttons (each owner edits only its own line; the test of skin.css checks that each declares --_h)
BUTTONS += ['.nx-last', '.nx-pill', '.nx-line-act']   # gate screen

BUTTONS += ['.nx-line-act']   # command feedback

BUTTONS += []   # status chip and sheet

BUTTONS += ['.nx-snack button']   # dialogs, LOG, accessibility

BUTTONS += []   # lists, settings, Favorites

BUTTONS += []   # setup wizard

BUTTONS += []   # Activity sheet

m3e = read('m3e.css')
m3e = m3e.replace('{{BTN}}', ', '.join(BUTTONS))
m3e = m3e.replace('{{WAVE}}', '--nx-wave-40: %s;\n  --nx-wave-20: %s;' % (wave_uri(40), wave_uri(20)))
m3e = m3e.replace('{{LOADER}}', loader_keyframes())
skin = read('skin.css')
# nx23: one part file per workstream (nx23-gate.css, nx23-command.css, nx23-dialogs.css, nx23-lists.css, nx23-wizard.css), in name order, after everything else
nx23 = '\n'.join(read(os.path.basename(p)) for p in sorted(glob.glob(os.path.join(HERE, 'nx23-*.css'))))
extra = read('status.css') + '\n' + read('activity.css') + '\n' + m3e + '\n' + read('gallery.css') + '\n' + nx23
extra = extra.replace('{{P}}', 'html:root body[data-ng-app]')
skin = skin.replace('{{P}}', 'html:root body[data-ng-app]')
skin = skin.replace('{{ICONS}}', icons)
LEGACY_SHAPES = ('cookie', 'sun', 'star')   # names from before nx22 that shapes.json still has: copies of cookie9, sunny and burst; not repeated in the css
lines = ['--nx-v-%s: %s;' % (k, v) for k, v in shapes.items() if k not in LEGACY_SHAPES]
skin = skin.replace('{{SHAPES}}', '\n  '.join(lines))
tokens = read('tokens.css')
out = tokens + '\n' + skin + '\n' + extra
left = re.findall(r'\{\{[A-Za-z_]+\}\}', out)
if left:
    raise SystemExit('placeholders left in the css: %s' % ', '.join(sorted(set(left))))
OUT = os.path.join(HERE, '..', 'nx-expressive.css')
open(OUT, 'w', encoding='utf-8').write(out)
print('nx-expressive.css:', len(out), 'bytes;', len(ICON_PATHS), 'icons;', len(shapes), 'shapes')
