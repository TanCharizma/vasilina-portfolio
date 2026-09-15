/**
 * Shared Navigation Component
 * Injects the global navigation into the page and handles dynamic states.
 */
(function() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isHomePage = window.location.pathname === '/' || window.location.pathname.endsWith('/index.html');
    const currentPage = window.location.pathname.split('/').pop(); // e.g., "about.html"

    let navClass = '';
    let logoHref = '/'; // Default for non-homepage, points to the root domain

    // --- 0. INSTANT SCROLLBAR LOCK ---
    // Instantly prevents the scrollbar from flashing before main.js loads
    const splashNode = document.getElementById('splash-screen');
    if (splashNode) {
        document.documentElement.classList.add('scroll-locked');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    }

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

    const isInternalNav = sessionStorage.getItem('internalNav') === 'true';
    sessionStorage.removeItem('internalNav');
    sessionStorage.removeItem('reverseNav'); // Clean up old data

    // Start the curtain hidden on the Homepage (so the luxury splash screen plays), but start it covering the screen on subpages or if navigating back internally.
    const startClass = (!isHomePage || isInternalNav) ? 'start-covered' : '';

    const navHTML = `
    <div class="app-transition-curtain ${startClass}" id="appCurtain"></div>
    <nav class="${navClass}">
        <a href="${logoHref}" class="logo">Vasilina Panina</a>
        <div class="nav-links">
            <div class="dropdown">
                <a href="${logoHref}" class="dropdown-trigger" aria-haspopup="true" aria-expanded="false">
                    <span lang="en">Home</span>
                    <span lang="th">หน้าหลัก</span>
                </a>
                <div class="dropdown-content">
                    <a href="${isHomePage ? '#highlights' : '/#highlights'}">
                        <span lang="en">Selected Stories</span>
                        <span lang="th">ผลงานคัดสรร</span>
                    </a>
                    <a href="${isHomePage ? '#measurements' : '/#measurements'}">
                        <span lang="en">Professional Record</span>
                        <span lang="th">ข้อมูลการทำงาน</span>
                    </a>
                    <a href="${isHomePage ? '#portfolio' : '/#portfolio'}">
                        <span lang="en">The Work</span>
                        <span lang="th">ผลงาน</span>
                    </a>
                    <a href="${isHomePage ? '#motion' : '/#motion'}">
                        <span lang="en">In Motion</span>
                        <span lang="th">ภาพเคลื่อนไหว</span>
                    </a>
                    <a href="${isHomePage ? '#digitals' : '/#digitals'}">
                        <span lang="en">Digitals</span>
                        <span lang="th">ดิจิทัลส์</span>
                    </a>
                </div>
            </div>
            <a href="/about.html">
                <span lang="en">About</span>
                <span lang="th">เกี่ยวกับฉัน</span>
            </a>
            <a href="/booking.html">
                <span lang="en">Booking</span>
                <span lang="th">จองคิว</span> 
            </a>
            <span class="lang-switch" id="langToggle" role="button" aria-label="Toggle language" tabindex="0">
                <span class="en">EN</span> / 
                <span class="th">TH</span>
            </span>
            <span class="theme-toggle" id="themeToggle" role="button" aria-label="Toggle theme" tabindex="0">
                <span lang="en">Dark</span>
                <span lang="th">โหมดมืด</span>
            </span>
        </div>
        <div class="mobile-toggle" id="mobileToggle" role="button" aria-label="Toggle navigation menu" aria-expanded="false" tabindex="0">
            <span></span>
            <span></span>
        </div>
    </nav>`;

    // Inject the navigation HTML
    document.currentScript.insertAdjacentHTML('beforebegin', navHTML);

    // After injection, get the nav element
    const navElement = document.querySelector('nav');
    const dropdown = navElement.querySelector('.dropdown');
    const dropdownTrigger = navElement.querySelector('.dropdown-trigger');
    let dropdownExitedAfterDismissal = false;

    const setDropdownExpanded = (expanded) => {
        if (dropdownTrigger) dropdownTrigger.setAttribute('aria-expanded', String(expanded));
    };

    const closeDropdown = () => {
        // The mobile submenu is always visible; dismissal is desktop-only.
        dropdown?.classList.toggle('dropdown-dismissed', window.innerWidth > 1024);
        dropdownExitedAfterDismissal = false;
        setDropdownExpanded(false);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };

    dropdown?.addEventListener('mouseenter', () => {
        if (dropdown.classList.contains('dropdown-dismissed')) {
            if (!dropdownExitedAfterDismissal) return;
            dropdown.classList.remove('dropdown-dismissed');
            dropdownExitedAfterDismissal = false;
        }
        setDropdownExpanded(true);
    });
    dropdown?.addEventListener('mouseleave', () => {
        if (dropdown.classList.contains('dropdown-dismissed')) {
            dropdownExitedAfterDismissal = true;
        }
        setDropdownExpanded(false);
    });
    dropdown?.addEventListener('focusin', () => setDropdownExpanded(true));
    dropdown?.addEventListener('focusout', (event) => {
        if (!dropdown.contains(event.relatedTarget)) setDropdownExpanded(false);
    });

    dropdown?.querySelectorAll('.dropdown-content a').forEach(link => {
        link.addEventListener('click', closeDropdown);
    });

    // --- NATIVE APP TRANSITION LOGIC ---
    document.addEventListener('DOMContentLoaded', () => {
        const curtain = document.getElementById('appCurtain');
        
        // Bypass Splash Screen immediately if navigating back to the home page internally
        if (isHomePage && isInternalNav) {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.removeAttribute('id'); // Disconnect from main.js timer
                splash.style.display = 'none'; // Hide visually
                document.documentElement.classList.remove('scroll-locked');
                document.documentElement.style.overflow = ''; // Unlock instantly
                document.body.style.overflow = '';
            }
        }

        // Page Entrance: Slide curtain out to reveal the new page
        if ((!isHomePage || isInternalNav) && curtain) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    curtain.style.transition = prefersReducedMotion
                        ? 'none'
                        : 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.8s';
                    curtain.classList.remove('start-covered', 'curtain-cover');
                    if (!prefersReducedMotion) document.body.classList.add('page-entrance');
                });
            });
        }

        // Intercept all clicks to trigger the slide-over effect
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link || !curtain) return;
            
            const href = link.getAttribute('href');
            
            // Ignore external links, mailto, phone numbers, new tabs, and hashes
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.includes('http') || link.getAttribute('target') === '_blank' || link.classList.contains('back-to-top') || e.ctrlKey || e.metaKey) {
                return;
            }

            // Ignore if linking to the exact same page
            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            let targetPath = href.split('/').pop().split('#')[0] || 'index.html';
            if (currentPath === targetPath) return;

            e.preventDefault();

            if (prefersReducedMotion) {
                window.location.href = href;
                return;
            }

            // Store navigation intent for the next page load
            sessionStorage.setItem('internalNav', 'true');

            // Close mobile menu if it's open so it doesn't glitch during transition
            if (navElement && navElement.classList.contains('nav-open')) {
                navElement.classList.remove('nav-open');
                document.documentElement.classList.remove('scroll-locked');
                document.body.style.overflow = '';
            }

            // Cover screen with cinematic fade
            curtain.style.transition = 'none';
            curtain.classList.remove('start-covered');
            
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    curtain.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.5s';
                    curtain.classList.add('curtain-cover');
                });
            });

            // Wait for curtain to fully cover the screen, then navigate
            setTimeout(() => window.location.href = href, 500);
        });

        // Failsafe for iOS Swipe-Back gesture (BFCache reset)
        window.addEventListener('pageshow', (e) => {
            if (e.persisted && curtain) {
                curtain.classList.remove('start-covered', 'curtain-cover');
            }
        });
    });

    // Handle active class for non-homepage links
    if (!isHomePage) {
        const currentLink = Array.from(navElement.querySelectorAll('.nav-links > a')).find(link => {
            return new URL(link.href, window.location.origin).pathname === window.location.pathname;
        });
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
    const closeMobileMenu = () => {
        navElement.classList.remove('nav-open');
        document.documentElement.classList.remove('scroll-locked');
        document.body.style.overflow = '';
        if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    };

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            navElement.classList.toggle('nav-open');
            const isOpen = navElement.classList.contains('nav-open');
            if (isOpen) {
                dropdown?.classList.remove('dropdown-dismissed');
                setDropdownExpanded(true);
                document.documentElement.classList.add('scroll-locked');
                document.body.style.overflow = 'hidden';
            } else {
                document.documentElement.classList.remove('scroll-locked');
                document.body.style.overflow = '';
            }
            mobileToggle.setAttribute('aria-expanded', isOpen);
        });

        mobileToggle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                mobileToggle.click();
            }
        });

        // Close menu when a link is clicked
        navElement.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                closeDropdown();
                closeMobileMenu();
            });
        });

        let menuTouchStartX = 0;
        let menuTouchStartY = 0;
        const menuPanel = navElement.querySelector('.nav-links');

        menuPanel.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1) return;
            menuTouchStartX = event.touches[0].clientX;
            menuTouchStartY = event.touches[0].clientY;
        }, { passive: true });

        menuPanel.addEventListener('touchend', (event) => {
            if (!navElement.classList.contains('nav-open')) return;
            const deltaX = event.changedTouches[0].clientX - menuTouchStartX;
            const deltaY = event.changedTouches[0].clientY - menuTouchStartY;
            if (deltaX > 60 && Math.abs(deltaX) > Math.abs(deltaY)) closeMobileMenu();
        }, { passive: true });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && navElement.classList.contains('nav-open')) closeMobileMenu();
        });

        // Cleanup: Ensure body scroll is restored if window is resized while menu is open
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024 && navElement.classList.contains('nav-open')) {
                closeMobileMenu();
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
        document.documentElement.lang = lang;
        if (lang === 'th') {
            document.body.classList.add('lang-th');
        } else {
            document.body.classList.remove('lang-th');
        }
        localStorage.setItem('preferredLang', lang);
    };

    navElement.querySelector('.lang-switch .en').addEventListener('click', () => setLanguage('en'));
    navElement.querySelector('.lang-switch .th').addEventListener('click', () => setLanguage('th'));

    navElement.querySelector('#langToggle').addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setLanguage(document.documentElement.lang === 'th' ? 'en' : 'th');
    });
    themeToggle.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        themeToggle.click();
    });

    // Initialize language on load
    setLanguage(localStorage.getItem('preferredLang') || 'en');

    // Custom Editorial Cursor
    if (window.matchMedia("(hover: hover)").matches && !prefersReducedMotion) {
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
        const interactiveSelector = 'a, button, .dropdown-trigger, .lang-switch span, .theme-toggle, .back-to-top, .modal-nav, img:not(#img01):not(.brand-logo):not([src*="brand_icons"]):not(.about-image img), .mobile-toggle';
        let hoverFrame = 0;
        const refreshCursorHover = () => {
            if (hoverFrame) return;
            hoverFrame = requestAnimationFrame(() => {
                hoverFrame = 0;
                const target = document.elementFromPoint(mouseX, mouseY);
                cursor.classList.toggle('hover', cursorVisible && Boolean(target?.closest(interactiveSelector)));
            });
        };

        window.addEventListener('mousemove', (e) => {
            if (!cursorVisible) {
                cursor.style.opacity = 'var(--cursor-opacity, 1)';
                cursorVisible = true;
            }
            mouseX = e.clientX;
            mouseY = e.clientY;
            refreshCursorHover();
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

        // Overlays and scrolling can change the target without moving the pointer.
        document.addEventListener('mouseover', refreshCursorHover);
        document.addEventListener('mouseout', refreshCursorHover);
        document.addEventListener('click', refreshCursorHover);
        document.addEventListener('portfolio:overlaychange', refreshCursorHover);
        document.addEventListener('scroll', refreshCursorHover, { passive: true, capture: true });
        window.addEventListener('resize', refreshCursorHover);

        document.addEventListener('mouseleave', () => {
            cursor.style.opacity = '0';
            cursorVisible = false;
            cursor.classList.remove('hover');
        });
        
        document.addEventListener('mouseenter', () => {
            cursor.style.opacity = 'var(--cursor-opacity, 1)';
            cursorVisible = true;
            refreshCursorHover();
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
                    if (!targetId || targetId === '#') return;

                    const targetElement = document.getElementById(decodeURIComponent(targetId.slice(1)));
                    
                    if (targetElement) {
                        e.preventDefault();
                        
                        const executeScroll = () => {
                            history.replaceState(null, null, targetId);

                            if (prefersReducedMotion) {
                                const targetY = targetElement.getBoundingClientRect().top + window.scrollY - 64;
                                window.scrollTo(0, targetY);
                                return;
                            }

                            // Actively track and seamlessly correct the scroll destination if lazy images push the layout down
                            let isUserScrolling = false;
                            const stopCorrection = () => isUserScrolling = true;
                            ['wheel', 'touchstart', 'mousedown', 'keydown'].forEach(evt => {
                                window.addEventListener(evt, stopCorrection, { once: true, passive: true });
                            });

                            let currentY = window.scrollY;
                            let lastTime = performance.now();

                            const scrollLoop = (time) => {
                                if (isUserScrolling) return;

                                const dt = time - lastTime;
                                lastTime = time;

                                // Continuously calculate the target destination in case lazy images expand above it
                                const targetY = targetElement.getBoundingClientRect().top + window.scrollY - 64;
                                const diff = targetY - currentY;

                                if (Math.abs(diff) < 1) {
                                    window.scrollTo(0, targetY);
                                    return;
                                }

                                // Framerate-independent lerp (Linear Interpolation) for buttery smooth gliding
                                // This natively absorbs layout shifts without glitching the native scrolling engine
                                const lerpFactor = 1 - Math.exp(-0.002 * dt); // Lower number = slower, softer glide
                                currentY += diff * lerpFactor;
                                
                                window.scrollTo(0, currentY);

                                requestAnimationFrame(scrollLoop);
                            };

                            requestAnimationFrame((time) => {
                                lastTime = time;
                                scrollLoop(time);
                            });
                        };

                        if (navElement.classList.contains('nav-open')) {
                            closeMobileMenu();
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
