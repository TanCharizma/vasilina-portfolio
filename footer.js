/**
 * Shared Footer Component
 * Injects the global footer into the page.
 */
(function() {
    const currentYear = new Date().getFullYear();
    const footerHTML = `
    <footer>
        <div class="container">
            <div class="footer-column">
                <p class="footer-label" data-footer-text="name"><span lang="en">Vasilina Panina</span><span lang="th">Vasilina Panina</span></p>
                <p data-footer-description lang="en" style="text-transform: none; letter-spacing: 0; line-height: 1.8; max-width: 280px;">Model &amp; creative director, based in Bangkok.</p>
                <p data-footer-description lang="th" style="text-transform: none; letter-spacing: 0; line-height: 1.8; max-width: 280px;">นางแบบและครีเอทีฟไดเรกเตอร์ ประจำอยู่ในกรุงเทพฯ</p>
            </div>
            <div class="footer-column">
                <p class="footer-label" data-footer-text="inquiries"><span lang="en">Inquiries</span><span lang="th">ติดต่อสอบถาม</span></p>
                <a data-footer-link="email" href="mailto:vasilina.panina2100@gmail.com">vasilina.panina2100@gmail.com</a>
                <a data-footer-text="booking" href="/booking.html"><span lang="en">Booking & Availability</span><span lang="th">การจองคิวและตารางงาน</span></a>
            </div>
            <div class="footer-column">
                <p class="footer-label" data-footer-text="connect"><span lang="en">Connect</span><span lang="th">ติดตามและติดต่อ</span></p>
                <a data-footer-text="instagram" data-footer-link="instagram" href="https://www.instagram.com/paninavasilina/" target="_blank" rel="noopener noreferrer"><span lang="en">Instagram</span><span lang="th">Instagram</span></a>
                <a data-footer-text="agency" data-footer-link="agency" href="https://www.instagram.com/charizma.management/" target="_blank" rel="noopener noreferrer"><span lang="en">Charizma Management</span><span lang="th">Charizma Management</span></a>
            </div>
            <div class="footer-bottom">
                <div data-footer-text="copyright"><span lang="en">&copy; ${currentYear} Vasilina Panina Portfolio. All rights reserved.</span><span lang="th">&copy; ${currentYear} Vasilina Panina Portfolio. All rights reserved.</span></div>
                <div class="attribution"><span data-footer-text="credit"><span lang="en">Crafted by</span><span lang="th">Crafted by</span></span> <a data-footer-text="designer" data-footer-link="designer" href="https://thefoliolab.vercel.app/" class="designer-link" target="_blank" rel="noopener noreferrer"><span lang="en">The Folio Lab</span><span lang="th">The Folio Lab</span></a></div>
            </div>
        </div>
    </footer>`;

    document.currentScript.insertAdjacentHTML('beforebegin', footerHTML);
})();
