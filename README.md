# Slice My Photo

[English](#slice-my-photo-1) | Polski

**Slice My Photo** to webowe narzędzie do projektowania obrazów dzielonych na wiele paneli, które pozwala rozłożyć pojedyncze zdjęcie na kilka oprawionych ramkami segmentów, zaplanować ich układ na wirtualnej ścianie i wyeksportować pliki gotowe do druku. Niezależnie od tego, czy chcesz stworzyć klasyczny tryptyk, symetryczną siatkę, czy całkowicie dowolny układ, narzędzie daje Ci pełną kontrolę nad każdym szczegółem.

Wczytaj zdjęcie, ustaw wymiary ściany i dodaj do ośmiu paneli. Wybierz jeden z gotowych układów, takich jak dyptyk, tryptyk lub zestaw panoramiczny, albo rozmieść panele swobodnie z inteligentnym przyciąganiem. Każdy panel może mieć własny styl ramki — wybierz jeden z siedmiu gotowych kolorów lub ustaw własny, dostosuj szerokość ramki i włącz cień. Passepartout można skonfigurować dla każdego panelu osobno, wybierając dokładny wymiar otwarcia, równomierne wcięcie lub niezależne marginesy z każdej strony.

Gdy wszystko jest już na swoim miejscu, ustaw obraz w każdym panelu w jednym z trzech trybów: dopasuj całe zdjęcie, wypełnij ramkę z przycięciem lub przeciągnij i skaluj ręcznie. Eksport pakuje każdy panel jako wysokiej rozdzielczości JPEG lub PNG, generuje wizualizację całej ściany i tworzy plik PDF ze wszystkimi wymiarami – gotowy do wydruku lub oprawienia.

Projekt został zbudowany z użyciem React 19, TypeScript i Vite. Renderowanie na canvasie obsługuje Konva.js, stan aplikacji zarządzany jest przez Zustand, a zadania eksportu działają poza głównym wątkiem dzięki Web Workerom. Dane sesji są przechowywane w localStorage i IndexedDB, więc możesz odświeżyć stronę i kontynuować dokładnie w miejscu, w którym skończyłeś.

---

# Slice My Photo

English | [Polski](#slice-my-photo)

**Slice My Photo** is a web-based wall art panel designer that lets you split a single photograph across multiple framed panels, plan the arrangement on a virtual wall, and export print-ready files. Whether you want a classic triptych, a symmetrical grid, or a completely custom layout, the tool gives you full control over every detail.

Upload an image, configure your wall dimensions, and add up to eight panels. Choose from preset layouts like a diptych, triptych, or a panoramic set, or arrange panels freely with smart snapping guides. Each panel can have its own frame style — pick from seven preset colors or set a custom one, adjust the frame width, and toggle a drop shadow. The passepartout (mat) can be configured per panel with either an exact opening size, a uniform inset, or independent margins on each side.

Once everything is in place, position the image within each panel in one of three modes: fit the whole image, fill the frame with cropping, or drag and scale manually. The export tool packages every panel as a high-resolution JPEG or PNG, generates a visualization of the full wall, and produces a PDF with all measurements clearly labeled — ready for printing or framing.

The project is built with React 19, TypeScript, and Vite. Canvas rendering is handled by Konva.js, state is managed with Zustand, and export tasks run off the main thread using Web Workers. Session data persists in localStorage and IndexedDB, so you can reload the page and pick up right where you left off.

## Development

Install the dependencies with `pnpm install`, then start the development server with `pnpm dev`. The application opens at `http://localhost:5173`. To create a production build, run `pnpm build` — the output lands in the `dist/` directory and can be previewed locally with `pnpm preview`.

Run `pnpm lint` to check the code with ESLint. A Playwright smoke test is available under `scripts/smoke.mjs` — it uploads a test image, applies a preset, adjusts styling, exports a ZIP, and verifies session persistence. Before running it, make sure Playwright browsers are installed with `pnpm exec playwright install chromium`.

**Contributions are welcome**.

### Tech stack

React 19, TypeScript 6, Vite 8, Konva.js, Zustand 5, JSZip, jsPDF, Lucide React, react-colorful, Playwright.
