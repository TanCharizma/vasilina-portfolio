/**
 * Shared Main JavaScript
 * Handles global reveal animations, modals, and homepage-specific interactions.
 */

// --- SILENT SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .catch(error => console.error('Service Worker registration failed:', error));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    
    // Cache viewport height globally for scroll calculations
    let vh = window.innerHeight;
    window.addEventListener('resize', () => vh = window.innerHeight, { passive: true });
    
    // --- 1. GLOBAL REVEAL ANIMATIONS ---
    const revealOptions = {
        threshold: 0,
        rootMargin: "0px 0px -200px 0px"
    };

    const revealObserver = new IntersectionObserver((entries) => {
        let toReveal = entries.filter(e => e.isIntersecting && !e.target.classList.contains('active'));

        if (toReveal.length > 1) {
            toReveal.sort((a, b) => {
                const rectA = a.boundingClientRect;
                const rectB = b.boundingClientRect;
                // Safe quantization (50px buckets) to prevent transitivity cycles in the sorting engine
                const aRow = Math.round(rectA.top / 50);
                const bRow = Math.round(rectB.top / 50);
                if (aRow !== bRow) return aRow - bRow;
                return rectA.left - rectB.left;
            });
        }

        toReveal.forEach((entry, index) => {
            const el = entry.target;
            if (!Array.from(el.classList).some(cls => cls.startsWith('delay-'))) {
                el.style.transitionDelay = `${index * 0.1}s`;
            }

            const images = el.tagName === 'IMG' ? [el] : Array.from(el.querySelectorAll('img'));
            const pendingImages = images.filter(img => !img.complete);

            const triggerActive = () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => el.classList.add('active'));
                });
                revealObserver.unobserve(el);
            };

            if (pendingImages.length > 0) {
                let loadedCount = 0;
                pendingImages.forEach(img => {
                    const checkLoad = () => {
                        loadedCount++;
                        if (loadedCount === pendingImages.length) triggerActive();
                    };
                    img.addEventListener('load', checkLoad, { once: true });
                    img.addEventListener('error', checkLoad, { once: true });
                });
            } else {
                triggerActive();
            }
        });
    }, revealOptions);

    // Select reveal targets (exclude hero reveals if on homepage to let hero loader handle them)
    const isHomePage = document.getElementById('hero') !== null;
    const revealTargets = isHomePage 
        ? document.querySelectorAll('.reveal:not(.hero .reveal)') 
        : document.querySelectorAll('.reveal');
        
    revealTargets.forEach(el => revealObserver.observe(el));


    // --- 2. HOMEPAGE SPECIFIC LOGIC ---
    if (isHomePage) {
        // Navigation Active State Observer
        const navOptions = { root: null, threshold: 0, rootMargin: "-80px 0px -80% 0px" };
        const navObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    if (['hero', 'highlights', 'portfolio', 'motion', 'measurements', 'digitals'].includes(id)) {
                        document.querySelectorAll('.nav-links a, .dropdown-trigger').forEach(el => el.classList.remove('active'));
                        const trigger = document.querySelector('.dropdown-trigger');
                        if (trigger) trigger.classList.add('active');
                        const subLink = document.querySelector(`.dropdown-content a[href="#${id}"], .dropdown-content a[href="index.html#${id}"]`);
                        if (subLink) subLink.classList.add('active');
                    }
                }
            });
        }, navOptions);
        document.querySelectorAll('header[id], section[id]').forEach(section => navObserver.observe(section));

        // Hero Entrance & Parallax
        const heroSection = document.getElementById('hero');
        const heroBg = document.querySelector('.hero-bg');
        const heroContent = document.querySelector('.hero-content');
        
        // Determine correct hero image path based on version
        const heroImgUrl = heroBg.style.backgroundImage.includes('placeholder-hero') 
            ? 'image/placeholder-hero.webp' 
            : 'image/hero/hero.webp';
            
        const heroImgLoader = new Image();
        heroImgLoader.src = heroImgUrl;

        const triggerHeroEntrance = () => {
            heroSection.classList.add('loaded');
            document.body.classList.add('hero-loaded'); // Signals the Nav to begin animating
            document.querySelectorAll('.hero .reveal').forEach(el => el.classList.add('active'));
        };

        const splashScreen = document.getElementById('splash-screen');
        const minSplashTime = new Promise(resolve => setTimeout(resolve, 2000)); // Minimum 2s immersive brand entrance
        
        const heroImageLoad = new Promise(resolve => {
            if (heroImgLoader.complete) resolve();
            else {
                heroImgLoader.addEventListener('load', resolve);
                heroImgLoader.addEventListener('error', resolve); // Proceed even if there is a loading error
            }
        });

        if (splashScreen) {
            document.documentElement.classList.add('scroll-locked');
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden'; // Lock screen during splash
            Promise.all([minSplashTime, heroImageLoad]).then(() => {
                splashScreen.classList.add('hidden');
                triggerHeroEntrance(); // Syncs hero elements precisely with splash fade
                // Unlock scrolling at the exact same time the splash screen starts fading for a seamless transition
                document.documentElement.classList.remove('scroll-locked');
                document.documentElement.style.overflow = '';
                document.body.style.overflow = '';
            });
        } else {
            heroImageLoad.then(triggerHeroEntrance);
        }

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrollOffset = window.scrollY;
                    if (scrollOffset <= vh) {
                        if (scrollOffset > 0 && heroBg.style.animation !== 'none') { heroBg.style.animation = 'none'; }
                        if (window.innerWidth > 768) {
                            const scale = 1 + (scrollOffset / vh) * 0.4; 
                            const parallax = scrollOffset * 0.15;
                            heroBg.style.transform = `scale(${scale}) translate3d(0, ${parallax}px, 0)`;
                        } else {
                            const scale = 1 + (scrollOffset / vh) * 0.15;
                            heroBg.style.transform = `scale(${scale}) translateZ(0)`;
                        }
                        heroContent.style.opacity = Math.max(0, 1 - (scrollOffset / (vh * 0.6)));
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // --- 3. BACK TO TOP LOGIC ---
    const backToTop = document.querySelector('.back-to-top');
    if (backToTop) {
        let isScrollingToTop = false;
        let scrollCheckInterval = null;
        let scrollTimeout = null;

        const evaluateBackToTop = () => {
            if (!backToTop || isScrollingToTop) return;
            if (window.scrollY > (vh * 0.5)) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        };

        backToTop.addEventListener('click', (e) => {
            e.preventDefault();
            isScrollingToTop = true;
            backToTop.style.opacity = '0';
            backToTop.style.pointerEvents = 'none';
            backToTop.classList.remove('visible');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            clearInterval(scrollCheckInterval);
            clearTimeout(scrollTimeout);

            const unlockButton = () => {
                isScrollingToTop = false;
                backToTop.style.opacity = '';
                backToTop.style.pointerEvents = '';
                evaluateBackToTop();
            };

            scrollCheckInterval = setInterval(() => {
                if (window.scrollY <= 0) {
                    clearInterval(scrollCheckInterval);
                    clearTimeout(scrollTimeout);
                    unlockButton();
                }
            }, 100);

            scrollTimeout = setTimeout(() => {
                clearInterval(scrollCheckInterval);
                unlockButton();
            }, 2000);
        });

        const interruptScroll = () => {
            if (isScrollingToTop) {
                clearInterval(scrollCheckInterval);
                clearTimeout(scrollTimeout);
                isScrollingToTop = false;
                backToTop.style.opacity = '';
                backToTop.style.pointerEvents = '';
                evaluateBackToTop();
            }
        };

        window.addEventListener('touchstart', interruptScroll, { passive: true });
        window.addEventListener('wheel', interruptScroll, { passive: true });
        window.addEventListener('scroll', () => window.requestAnimationFrame(evaluateBackToTop), { passive: true });
    }

    // --- SCROLL LOCK HELPER ---
    // Prevents the background layout from shifting when the scrollbar disappears
    const lockScroll = () => {
        // scrollbar-gutter: stable already handles the layout reservation natively
        document.documentElement.classList.add('scroll-locked');
        document.body.style.overflow = 'hidden';
    };
    const unlockScroll = () => {
        document.documentElement.classList.remove('scroll-locked');
        document.body.style.overflow = '';
    };

    // --- 4. IMAGE MODAL LOGIC (With Keyboard Support) ---
    const modal = document.getElementById("imageModal");
    if (modal) {
        const modalImg = document.getElementById("img01");
        let currentSectionImages = [];
        let currentImgIndex = 0;
        
        const updateModal = (index, direction = 0, isOpening = false) => {
            const finalizeUpdate = () => {
                currentImgIndex = index;
                const newSrc = currentSectionImages[currentImgIndex].src;
                
                const playAnimation = () => {
                    document.querySelector('.modal-prev').style.visibility = currentImgIndex === 0 ? 'hidden' : 'visible';
                    document.querySelector('.modal-next').style.visibility = currentImgIndex === currentSectionImages.length - 1 ? 'hidden' : 'visible';
                    
                    if (direction !== 0) {
                        // Prep new image off-screen opposite to the swipe
                        modalImg.style.transition = 'none';
                        modalImg.style.transform = `translate(calc(-50% + ${direction * 50}px), -50%)`;
                        modalImg.style.opacity = '0';
                        
                        // Animate new image sliding into center
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                modalImg.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease';
                                modalImg.style.transform = `translate(-50%, -50%)`;
                                modalImg.style.opacity = '1';
                            });
                        });
                    } else if (isOpening) {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                modalImg.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease';
                                modalImg.style.transform = `translate(-50%, -50%) scale(1)`;
                                modalImg.style.opacity = '1';
                            });
                        });
                    } else {
                        modalImg.style.transition = 'none';
                        modalImg.style.transform = `translate(-50%, -50%)`;
                        modalImg.style.opacity = '1';
                    }
                };

                // Wait for the new image to fully render its dimensions before animating
                if (modalImg.src !== newSrc) {
                    modalImg.src = newSrc;
                    modalImg.alt = currentSectionImages[currentImgIndex].alt || 'Expanded portfolio image';
                    
                    // Use modern decode() to completely eliminate 1-frame layout thrashing
                    modalImg.decode().then(playAnimation).catch(playAnimation);
                } else {
                    playAnimation();
                }
            };

            if (direction !== 0) {
                // Animate old image sliding out
                modalImg.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
                modalImg.style.transform = `translate(calc(-50% + ${direction * -100}px), -50%)`;
                modalImg.style.opacity = '0';
                setTimeout(finalizeUpdate, 200);
            } else {
                finalizeUpdate();
            }
        };

        // Filter out any image that is a brand logo (by class or by folder path)
        const galleryImages = Array.from(document.querySelectorAll('section img')).filter(img => {
            return !img.classList.contains('brand-logo') && !img.src.includes('brand_icons') && !img.closest('.split-layout');
        });

        galleryImages.forEach((img) => {
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => {
                // Freeze the hover state so it doesn't drop while the modal opens
                img.classList.add('freeze-hover');
                setTimeout(() => img.classList.remove('freeze-hover'), 600);

                const parentSection = img.closest('section');
                currentSectionImages = Array.from(parentSection.querySelectorAll('img'))
                    .filter(i => !i.classList.contains('brand-logo') && !i.src.includes('brand_icons') && !i.closest('.split-layout'));
                
                // Prep image state BEFORE making modal visible to prevent 1-frame flashes
                modalImg.style.transition = 'none';
                modalImg.style.transform = 'translate(-50%, -50%) scale(0.95)';
                modalImg.style.opacity = '0';
                
                lockScroll();
                modal.classList.add('show-modal');
                updateModal(currentSectionImages.indexOf(img), 0, true);
            });
        });

        document.querySelector('.modal-prev').onclick = (e) => { e.stopPropagation(); updateModal(currentImgIndex - 1, -1); };
        document.querySelector('.modal-next').onclick = (e) => { e.stopPropagation(); updateModal(currentImgIndex + 1, 1); };
        modalImg.onclick = (e) => e.stopPropagation();
        
        const closeModal = () => {
            modal.classList.remove('show-modal');
            unlockScroll();
            // Clear transforms for next open
            setTimeout(() => {
                modalImg.style.transition = 'none';
                modalImg.style.transform = 'translate(-50%, -50%)';
                modalImg.style.opacity = '1';
            }, 300);
        };
        
        modal.onclick = closeModal;

        // Added Keyboard UX for premium navigation
        document.addEventListener('keydown', (e) => {
            if (modal.classList.contains('show-modal')) {
                if (e.key === 'Escape') closeModal();
                if (e.key === 'ArrowLeft' && currentImgIndex > 0) updateModal(currentImgIndex - 1, -1);
                if (e.key === 'ArrowRight' && currentImgIndex < currentSectionImages.length - 1) updateModal(currentImgIndex + 1, 1);
            }
        });
        
        // Mobile Touch Swipe Navigation
        let touchStartX = 0;
        let touchCurrentX = 0;
        let isSwiping = false;

        modal.addEventListener('touchstart', e => {
            if (e.touches.length > 1) return; // Ignore multi-touch
            touchStartX = e.changedTouches[0].screenX;
            isSwiping = true;
            modalImg.style.transition = 'none'; // Lock to finger
        }, { passive: true });

        // Lock background scroll on mobile completely when touching the modal
        modal.addEventListener('touchmove', e => {
            e.preventDefault();
            if (!isSwiping) return;
            touchCurrentX = e.changedTouches[0].screenX;
            const deltaX = touchCurrentX - touchStartX;
            
            // Elastic drag tracking
            modalImg.style.transform = `translate(calc(-50% + ${deltaX * 0.6}px), -50%)`;
            modalImg.style.opacity = Math.max(0.3, 1 - Math.abs(deltaX) / window.innerWidth);
        }, { passive: false });

        modal.addEventListener('touchend', e => {
            if (!isSwiping) return;
            isSwiping = false;
            const touchEndX = e.changedTouches[0].screenX;
            const deltaX = touchEndX - touchStartX;
            const swipeThreshold = 50; // Required distance

            if (deltaX < -swipeThreshold && currentImgIndex < currentSectionImages.length - 1) {
                updateModal(currentImgIndex + 1, 1); // Swipe left -> Next
            } else if (deltaX > swipeThreshold && currentImgIndex > 0) {
                updateModal(currentImgIndex - 1, -1); // Swipe right -> Prev
            } else {
                // Snap back to center if they didn't drag far enough
                modalImg.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease';
                modalImg.style.transform = `translate(-50%, -50%)`;
                modalImg.style.opacity = '1';
            }
        }, { passive: true });

        // Global Escape Key for Comp Card Modal
        document.addEventListener('keydown', (e) => {
            const compModal = document.getElementById('compCardModal');
            if (e.key === 'Escape' && compModal && compModal.classList.contains('show-modal')) {
                compModal.classList.remove('show-modal');
                unlockScroll();
            }
        });
    }

    // --- 5. COMP CARD LOGIC ---
    const compCardBtn = document.getElementById('compCardBtn');
    const compCardModal = document.getElementById('compCardModal');
    const compCardImg = document.getElementById('compCardImg');
    const compCardDownload = document.getElementById('compCardDownload');

    if (compCardBtn && compCardModal) {
        // Lock background scroll for Comp Card Modal as well
        compCardModal.addEventListener('touchmove', e => {
            e.preventDefault();
        }, { passive: false });

        compCardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Prep image state BEFORE making modal visible
            compCardImg.style.transition = 'none';
            compCardImg.style.transform = 'translate(-50%, -50%) scale(0.95)';
            compCardImg.style.opacity = '0';
            
            lockScroll();
            compCardModal.classList.add('show-modal');
            
            const playCompCardAnimation = () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        compCardImg.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease';
                        compCardImg.style.transform = 'translate(-50%, -50%) scale(1)';
                        compCardImg.style.opacity = '1';
                    });
                });
            };
            
            compCardImg.decode().then(playCompCardAnimation).catch(playCompCardAnimation);
        });

        compCardModal.onclick = (e) => {
            // Close if clicking the background, but don't close if clicking the image or download button
            if (e.target !== compCardImg && !compCardDownload.contains(e.target)) {
                compCardModal.classList.remove('show-modal');
                unlockScroll();
            }
        };
    }
});