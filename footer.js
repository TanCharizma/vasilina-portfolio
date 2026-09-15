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
                <p class="footer-label">Vasilina Panina</p>
                <p lang="en" style="text-transform: none; letter-spacing: 0; line-height: 1.8; max-width: 280px;">Model &amp; creative director, based in Bangkok.</p>
                <p lang="th" style="text-transform: none; letter-spacing: 0; line-height: 1.8; max-width: 280px;">นางแบบและครีเอทีฟไดเรกเตอร์ ประจำอยู่ในกรุงเทพฯ</p>
            </div>
            <div class="footer-column">
                <p class="footer-label" lang="en">Inquiries</p>
                <p class="footer-label" lang="th">ติดต่อสอบถาม</p>
                <a href="mailto:vasilina.panina2100@gmail.com">vasilina.panina2100@gmail.com</a>
                <a href="/booking.html"><span lang="en">Booking & Availability</span><span lang="th">การจองคิวและตารางงาน</span></a>
            </div>
            <div class="footer-column">
                <p class="footer-label" lang="en">Connect</p>
                <p class="footer-label" lang="th">ติดตามและติดต่อ</p>
                <a href="https://www.instagram.com/paninavasilina/" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href="https://www.instagram.com/charizma.management/" target="_blank" rel="noopener noreferrer">Charizma Management</a>
            </div>
            <div class="footer-bottom">
                <div>&copy; ${currentYear} Vasilina Panina Portfolio. All rights reserved.</div>
                <div class="attribution">Crafted by <a href="https://thefoliolab.vercel.app/" class="designer-link" target="_blank" rel="noopener noreferrer">The Folio Lab</a></div>
            </div>
        </div>
    </footer>`;

    document.currentScript.insertAdjacentHTML('beforebegin', footerHTML);
})();
