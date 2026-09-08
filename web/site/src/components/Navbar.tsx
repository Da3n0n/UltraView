import { createSignal, onMount, onCleanup } from 'solid-js';

function Navbar() {
    const [isOpen, setIsOpen] = createSignal(false);
    const [scrolled, setScrolled] = createSignal(false);
    const [theme, setTheme] = createSignal<'dark' | 'light'>('dark');

    const handleScroll = () => {
        setScrolled(window.scrollY > 50);
    };

    const applyTheme = (nextTheme: 'dark' | 'light') => {
        document.documentElement.dataset.theme = nextTheme;
        window.localStorage.setItem('ultraview-site-theme', nextTheme);
        setTheme(nextTheme);
    };

    const toggleTheme = () => {
        applyTheme(theme() === 'dark' ? 'light' : 'dark');
    };

    onMount(() => {
        const savedTheme = window.localStorage.getItem('ultraview-site-theme');
        const preferredTheme =
            savedTheme === 'dark' || savedTheme === 'light'
                ? savedTheme
                : window.matchMedia('(prefers-color-scheme: light)').matches
                  ? 'light'
                  : 'dark';

        applyTheme(preferredTheme);
        window.addEventListener('scroll', handleScroll);
    });

    onCleanup(() => {
        window.removeEventListener('scroll', handleScroll);
    });

    return (
        <nav class={`navbar ${scrolled() ? 'scrolled' : ''}`} id="navbar">
            <div class="container nav-container">
                <a href="/" class="logo">
                    <img class="logo-image" src="/ultraview-icon.png" alt="Ultraview" />
                </a>
                <div class={`nav-links ${isOpen() ? 'open' : ''}`} id="navLinks">
                    <a href="/#features" onClick={() => setIsOpen(false)}>
                        Features
                    </a>
                    <a href="/#tools" onClick={() => setIsOpen(false)}>
                        Tools
                    </a>
                    <a href="/#projects" onClick={() => setIsOpen(false)}>
                        Projects
                    </a>
                    <a href="/docs" onClick={() => setIsOpen(false)}>
                        Docs
                    </a>
                    <a href="/#download" class="btn btn-primary" onClick={() => setIsOpen(false)}>
                        Download
                    </a>
                </div>
                <button
                    class="mobile-menu-btn"
                    id="mobileMenuBtn"
                    aria-label="Toggle menu"
                    onClick={() => setIsOpen(!isOpen())}
                >
                    <span class={isOpen() ? 'open' : ''}></span>
                    <span class={isOpen() ? 'open' : ''}></span>
                    <span class={isOpen() ? 'open' : ''}></span>
                </button>
            </div>
            <button
                class="theme-toggle-fixed"
                type="button"
                aria-label={`Switch to ${theme() === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme() === 'dark' ? 'light' : 'dark'} mode`}
                onClick={toggleTheme}
            >
                {theme() === 'dark' ? (
                    <svg
                        class="theme-icon"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2" />
                        <path d="M12 20v2" />
                        <path d="m4.93 4.93 1.41 1.41" />
                        <path d="m17.66 17.66 1.41 1.41" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="m6.34 17.66-1.41 1.41" />
                        <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                ) : (
                    <svg
                        class="theme-icon"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                )}
            </button>
        </nav>
    );
}

export default Navbar;
