# Slice My Photo

[English](#slice-my-photo-1) | Polski

**Slice My Photo** to internetowe narzędzie do projektowania ściany złożonej z wielu paneli. Podziel jedno zdjęcie na oprawione segmenty, ustaw ich układ i przygotuj pliki do druku. Zaprojektuj dyptyk, tryptyk, siatkę albo własną kompozycję.

## Najważniejsze funkcje

- Dodaj do ośmiu paneli, ustaw wymiary ściany i pracuj w centymetrach lub calach.
- Zacznij od gotowego układu, rozmieszczaj panele swobodnie i przyciągaj je do krawędzi, środków oraz równych odstępów.
- Ustaw wspólny styl ramy albo zmieniaj go osobno dla każdego panelu. Wybierz kolor, szerokość krawędzi, cień i ustawienia passepartout.
- Dopasuj całe zdjęcie, wypełnij panel z przycięciem albo ustaw pozycję i skalę ręcznie.
- Sprawdź projekt przed drukiem. Kontrola jakości pokazuje DPI, pokrycie obrazu, nakładanie paneli i elementy wychodzące poza ścianę.
- Otwórz podgląd tylko do odczytu z numerami paneli, aby obejrzeć gotowy układ bez przypadkowych zmian.
- Pobierz ZIP z osobnymi plikami JPEG lub PNG. Dołącz wizualizację ściany oraz arkusz PDF z wymiarami paneli, obszarów obrazu, odstępów i szerokościami krawędzi poszczególnych ramek. Eksport celuje w 300 DPI, a aplikacja ostrzega o niższym efektywnym DPI i ogranicza rozmiar pliku do rozdzielczości zdjęcia.
- Zapisuj układy w tej przeglądarce, wczytuj je później i cofaj lub ponawiaj zmiany.
- Eksportuj cały projekt do pliku `.smp` razem ze zdjęciem, a potem importuj go na innym urządzeniu z przycisku `Import Project`.

## Szczegóły techniczne

Projekt korzysta z React 19, TypeScript i Vite. Konva.js obsługuje renderowanie canvasu, a Zustand zarządza stanem aplikacji. Web Worker generuje kadry paneli i wizualizację ściany. Przeglądarka tworzy archiwum ZIP i PDF z pomiarami w głównym wątku. Kod eksportu i jego zależności są ładowane dopiero po otwarciu okna eksportu. Układ i ustawienia projektu są zapisywane w localStorage. Oryginalne zdjęcie jest przechowywane osobno w IndexedDB na potrzeby przywrócenia po odświeżeniu, jeśli przeglądarka na to pozwala. Ograniczenia miejsca lub prywatności mogą wymagać ponownego wczytania zdjęcia.

---

# Slice My Photo

English | [Polski](#slice-my-photo)

**Slice My Photo** is a browser-based wall art panel designer. Split one photograph across framed panels, arrange them on a virtual wall, and prepare files for printing. Build a diptych, triptych, grid, or custom composition.

## Highlights

- Add up to eight panels, set wall dimensions, and work in centimeters or inches.
- Start from a preset, place panels freely, and snap them to edges, centers, and matching gaps.
- Use one shared frame style or set each panel independently. Choose frame colors, edge widths, shadows, and passepartout settings.
- Fit the whole photo, fill panels with cropping, or position and scale the image by hand.
- Check the layout before printing. Print preflight reports DPI, image coverage, panel overlaps, and areas outside the wall.
- Open a read-only preview with numbered panels to inspect the finished arrangement without accidental edits.
- Download a ZIP with separate JPEG or PNG files. Add a full-wall visualization and a measurements PDF with panel dimensions, image areas, gaps, and the resolved frame-edge width for each panel. Export targets 300 DPI, flags lower effective DPI, and caps file dimensions at the source image resolution.
- Save layouts in this browser, load them later, and undo or redo changes.
- Export a complete `.smp` project with its source image, then import it on another device with the `Import Project` button.

## Technical details

The project uses React 19, TypeScript, and Vite. Konva.js handles canvas rendering, and Zustand manages application state. A Web Worker generates panel crops and the wall visualization. The browser assembles the ZIP and measurements PDF on the main thread. Export code and its dependencies load only when Export opens. Project layout and settings persist in localStorage. The original image is stored separately in IndexedDB for reload recovery when the browser permits it. Storage limits or privacy restrictions may require the image to be uploaded again after a refresh.

## Development

Install the dependencies with `pnpm install`, then start the development server with `pnpm dev`. The application opens at `http://localhost:5173`. To create a production build, run `pnpm build`. The output lands in the `dist/` directory and can be previewed locally with `pnpm preview`.

Run `pnpm lint` to check the code with ESLint. A Playwright smoke test is available under `scripts/smoke.mjs`. It uploads a test image, applies a preset, adjusts styling, exports a ZIP, and verifies session persistence. Before running it, make sure Playwright browsers are installed with `pnpm exec playwright install chromium`.

**Contributions are welcome**.

### Tech stack

React 19, TypeScript 6, Vite 8, Konva.js, Zustand 5, JSZip, jsPDF, Lucide React, react-colorful, Playwright.
