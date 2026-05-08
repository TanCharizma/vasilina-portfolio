/**
 * Shared Navigation Component
 * Injects the global navigation into the page and handles dynamic states.
 */
(function() {
    const isHomePage = window.location.pathname === '/' || window.location.pathname.endsWith('/index.html');
    const currentPage = window.location.pathname.split('/').pop(); // e.g., "about.html"

    let navClass = '';
    let logoHref = 'index.html'; // Default for non-homepage

    if (isHomePage) { // Homepage specific setup
        navClass = 'on-hero'; // Apply on-hero class for transparent state
        logoHref = '#hero'; // Logo scrolls to hero section on homepage
    } else { // Non-homepage setup
        navClass = 'scrolled';
    }

    // Auto-inject Meta Tags based on config.js
    document.addEventListener('DOMContentLoaded', () => {
        if (window.CLIENT_CONFIG) {
            const config = window.CLIENT_CONFIG;
            // Gracefully handles both Vasilina's and the Master Templates' config structures
            const description = config.tagline?.en || config.taglineEn || 'Portfolio'; 
            const title = document.title;
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
            
            const setMeta = (attr, key, val) => {
                let meta = document.querySelector(`meta[${attr}="${key}"]`);
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.setAttribute(attr, key);
                    document.head.appendChild(meta);
                }
                meta.setAttribute('content', val);
            };

            setMeta('name', 'description', description);
            setMeta('property', 'og:title', title);
            setMeta('property', 'og:description', description);
            setMeta('property', 'og:type', 'website');
            setMeta('property', 'og:image', `${baseUrl}/image/hero/hero.webp`); // Absolute URL required for social cards
        }
    });

    const navHTML = `
    <nav class="${navClass}">
        <a href="${logoHref}" class="logo">Vasilina Panina</a>
        <div class="nav-links">
            <div class="dropdown">
                <a href="${logoHref}" class="dropdown-trigger">
                    <span lang="en">Home</span>
                    <span lang="th">หน้าหลัก</span>
                </a>
                <div class="dropdown-content">
                    <a href="${isHomePage ? '#highlights' : 'index.html#highlights'}">
                        <span lang="en">Highlights</span>
                        <span lang="th">ไฮไลต์</span>
                    </a>
                    <a href="${isHomePage ? '#portfolio' : 'index.html#portfolio'}">
                        <span lang="en">Portfolio</span>
                        <span lang="th">ผลงาน</span>
                    </a>
                    <a href="${isHomePage ? '#motion' : 'index.html#motion'}">
                        <span lang="en">Videos</span>
                        <span lang="th">วิดีโอ</span>
                    </a>
                    <a href="${isHomePage ? '#measurements' : 'index.html#measurements'}">
                        <span lang="en">Measurements</span>
                        <span lang="th">สัดส่วน</span>
                    </a>
                    <a href="${isHomePage ? '#digitals' : 'index.html#digitals'}">
                        <span lang="en">Snaps</span>
                        <span lang="th">สแนปช็อต</span>
                    </a>
                </div>
            </div>
            <a href="about.html">
                <span lang="en">About</span>
                <span lang="th">เกี่ยวกับฉัน</span>
            </a>
            <a href="booking.html">
                <span lang="en">Booking</span>
                <span lang="th">จองคิว</span> 
            </a>
            <span class="lang-switch" id="langToggle">
                <span class="en">EN</span> / 
                <span class="th">TH</span>
            </span>
            <span class="theme-toggle" id="themeToggle">
                <span lang="en">Dark</span>
                <span lang="th">โหมดมืด</span>
            </span>
        </div>
        <div class="mobile-toggle" id="mobileToggle">
            <span></span>
            <span></span>
        </div>
    </nav>`;

    // Inject the navigation HTML
    document.currentScript.insertAdjacentHTML('beforebegin', navHTML);

    // After injection, get the nav element
    const navElement = document.querySelector('nav');

    // Handle active class for non-homepage links
    if (!isHomePage) {
        const currentLink = navElement.querySelector(`a[href="${currentPage}"]`);
        if (currentLink) {
            currentLink.classList.add('active');
        }
    }

    // Handle scroll-triggered 'scrolled' class for homepage
    if (isHomePage) {
        window.addEventListener('scroll', () => {
            window.scrollY > 50 ? navElement.classList.add('scrolled') : navElement.classList.remove('scrolled');
        }, { passive: true }); /* Unblocks iOS scrolling thread */
    }

    // Mobile Menu Logic
    const mobileToggle = navElement.querySelector('#mobileToggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            navElement.classList.toggle('nav-open');
            document.body.style.overflow = navElement.classList.contains('nav-open') ? 'hidden' : '';
        });

        // Close menu when a link is clicked
        navElement.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                const href = link.getAttribute('href');
                // If it's a home page hash link, let the interceptor handle the closing to prevent iOS GPU panic
                if (isHomePage && href && href.startsWith('#')) return;

                navElement.classList.remove('nav-open');
                document.body.style.overflow = '';
            });
        });

        // Cleanup: Ensure body scroll is restored if window is resized while menu is open
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024 && navElement.classList.contains('nav-open')) {
                navElement.classList.remove('nav-open');
                document.body.style.overflow = '';
            }
        });
    }

    // Theme Switching Logic
    const themeToggle = navElement.querySelector('#themeToggle');
    const updateThemeUI = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        const enSpan = themeToggle.querySelector('[lang="en"]');
        const thSpan = themeToggle.querySelector('[lang="th"]');
        if (theme === 'dark') {
            enSpan.textContent = 'Light';
            thSpan.textContent = 'โหมดสว่าง';
        } else {
            enSpan.textContent = 'Dark';
            thSpan.textContent = 'โหมดมืด';
        }
        localStorage.setItem('preferredTheme', theme);
    };

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        updateThemeUI(isDark ? 'light' : 'dark');
    });

    // Initialize theme on load
    updateThemeUI(localStorage.getItem('preferredTheme') || 'light');

    // Language Switching Logic
    const setLanguage = (lang) => {
        if (lang === 'th') {
            document.body.classList.add('lang-th');
        } else {
            document.body.classList.remove('lang-th');
        }
        localStorage.setItem('preferredLang', lang);
    };

    navElement.querySelector('.lang-switch .en').addEventListener('click', () => setLanguage('en'));
    navElement.querySelector('.lang-switch .th').addEventListener('click', () => setLanguage('th'));

    // Initialize language on load
    setLanguage(localStorage.getItem('preferredLang') || 'en');

    // Custom Editorial Cursor
    if (window.matchMedia("(hover: hover)").matches) {
        const cursor = document.createElement('div');
        cursor.className = 'cursor-dot';
        document.body.appendChild(cursor);

        let cursorVisible = false;
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let cursorX = mouseX;
        let cursorY = mouseY;
        let isCursorClicked = false;
        let currentScale = 1;

        window.addEventListener('mousemove', (e) => {
            if (!cursorVisible) {
                cursor.style.opacity = '1';
                cursorVisible = true;
            }
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        document.addEventListener('mousedown', () => isCursorClicked = true);
        document.addEventListener('mouseup', () => isCursorClicked = false);

        const renderCursor = () => {
            cursorX += (mouseX - cursorX) * 0.6; // Faster tracking
            cursorY += (mouseY - cursorY) * 0.6; // Faster tracking
            currentScale += ((isCursorClicked ? 0.7 : 1) - currentScale) * 0.4; // Smooth scaling
            
            // Split translations to completely avoid calc() lag in Safari
            cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%) scale(${currentScale})`;
            requestAnimationFrame(renderCursor);
        };
        requestAnimationFrame(renderCursor);

        // Event delegation for hover states
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest('a, button, .dropdown-trigger, .lang-switch span, .theme-toggle, .back-to-top, .modal-nav, img:not(.brand-logo):not([src*="brand_icons"]), .mobile-toggle')) {
                cursor.classList.add('hover');
            }
        });
        
        document.addEventListener('mouseout', (e) => {
            // Only remove hover if we are actually leaving the interactive element entirely
            if (!e.relatedTarget || !e.relatedTarget.closest('a, button, .dropdown-trigger, .lang-switch span, .theme-toggle, .back-to-top, .modal-nav, img:not(.brand-logo):not([src*="brand_icons"]), .mobile-toggle')) {
                cursor.classList.remove('hover');
            }
        });

        document.addEventListener('mouseleave', () => {
            cursor.style.opacity = '0';
            cursorVisible = false;
        });
        
        document.addEventListener('mouseenter', () => {
            cursor.style.opacity = '1';
            cursorVisible = true;
        });
    }

    // Dynamic Layout-Aware Smooth Scroll & Hash Navigation Fix (Homepage Only)
    if (isHomePage) {
        document.addEventListener('DOMContentLoaded', () => {
            // 1. Intercept standard on-page clicks
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                if (anchor.classList.contains('back-to-top')) return;
                
                anchor.addEventListener('click', function(e) {
                    const targetId = this.getAttribute('href');
                    const targetElement = document.querySelector(targetId);
                    
                    if (targetElement) {
                        e.preventDefault();
                        
                        const executeScroll = () => {
                            // Calculate target destination ONCE to prevent layout thrashing and freezing
                            let targetY = Math.max(0, targetElement.getBoundingClientRect().top + window.scrollY - 64);
        
                            // Use native CSS smooth scrolling for hardware-accelerated, buttery smooth performance
                            window.scrollTo({
                                top: targetY,
                                behavior: 'smooth'
                            });
                            
                            history.replaceState(null, null, targetId);
                        };

                        if (navElement.classList.contains('nav-open')) {
                            navElement.classList.remove('nav-open');
                            document.body.style.overflow = '';
                            // Delay scroll by 100ms to prevent iOS Safari compositor crash after body unlock reflow
                            setTimeout(executeScroll, 100);
                        } else {
                            executeScroll();
                        }
                    }
                });
            });

            // 2. Fix cross-page navigation when arriving with a hash (e.g. index.html#motion)
            if (window.location.hash) {
                const targetElement = document.querySelector(window.location.hash);
                
                if (targetElement) {
                    let isUserScrolling = false;
                    
                    // Stop correcting if the user manually tries to scroll
                    const stopCorrection = () => isUserScrolling = true;
                    ['wheel', 'touchstart', 'mousedown', 'keydown'].forEach(evt => {
                        window.addEventListener(evt, stopCorrection, { once: true, passive: true });
                    });

                    let trackingActive = true;
                    
                    const trackTarget = () => {
                        if (isUserScrolling || !trackingActive) return;
                        
                        const rectTop = targetElement.getBoundingClientRect().top;
                        
                        // If layout shifts push the target away from the header, immediately correct it
                        if (Math.abs(rectTop - 64) > 2) {
                            window.scrollTo(0, rectTop + window.scrollY - 64);
                        }
                        
                        if (trackingActive) {
                            requestAnimationFrame(trackTarget);
                        }
                    };

                    // Start stapling the viewport to the target immediately
                    trackTarget();

                    // Safely disconnect the tracker once the page fully resolves
                    window.addEventListener('load', () => { 
                        setTimeout(() => trackingActive = false, 500); // Allow brief buffer for final renders
                    });
                    
                    // Failsafe disconnect after 3 seconds
                    setTimeout(() => trackingActive = false, 3000);
                }
            }
        });
    }
})();