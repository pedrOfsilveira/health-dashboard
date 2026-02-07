
Skip to main content

    Help Center
    Community
    Get started with Chrome

Google Chrome

Your account, pedrofsilveira24@gmail.com, has 2-Step Verification. If you ever lose your verification device, backup codes can help you sign in to your account. Get backup codes.
Saeed Khamseh
Original Poster
Sep 22, 2019
PWA App showing white screen due to very slow load on cold start
Hi, this is a very complex issue to describe, so I try my best to explain it in full details: We have an PWA app written in Angular framework, using Angular Service Worker package for PWA functionality. Recently we have noticed via Google Analytics that our page loads has gone too high and users complaining about our PWA app not loading (or very slow loading) in their desktop systems.

So, we begin investigating this issue and could reproduce it under certain conditions; We found out that it's not something related to our code, because many similar projects with the same library (Angular+ServiceWorker) also have this problem. I paste some of the urls here for testing:
https://firestarter-96e46.firebaseapp.com
https://angular-pwa-38ba5.firebaseapp.com
https://pwa.ng

So, these are steps to reproduce this issue on Chrome 76 & 77 (This two versions are the ones I could reproduce on them)
1. Go to the given URL (In desktop, not mobile).
2. Click Install button on address bar for installing the PWA app.
3. Close all chrome windows and processes (Important)
4. Run PWA app by clicking it's icon on the desktop
5. Window pops up, but with no content, just a white screen.

This is very confusing, Because if you have any chrome window opened before opening the app, it works just fine. That's what makes step 3 so important in reproducing the issue and for having a so-called cold start effect on app start-up.

I tried other pwa apps that were written using Google WorkBox library, and they didn't had this issue. I guess this is somehow related to Angular ServiceWorker implementation causing some conflict with Chrome recent versions.

Possible Workaround:
After a lot of trial & errors, I noticed that if I put an async script tag in the end of head tag in my index.html, page renders fine, although page loading is still in progress for about 4-5 minutes without any specific reason and then window.load fires.

This is a very frustrating issue and I really appreciate if you could shed some lights on it.
Details
Crashes and Slow Performance
,
Windows
,
Stable (Default)
Locked
Informational notification.
This question is locked and replying has been disabled.
Community content may not be verified or up-to-date. Learn more.
Last edited Sep 22, 2019
All Replies (23)
J
josua
Sep 23, 2019
Same problem here, thank you for bringing this up!
Could you please share more details on your workaround?
Thank you!

Btw: The same issue happens if you select the app site as your chrome start page. On a cold start it also doesn't render.
Last edited Sep 23, 2019
G
Gabriele Coroniti
Oct 9, 2019
I have the same problem. If I click refresh on the context menu, the page load. What is the problem?
G
Gabriele Coroniti
Oct 9, 2019
I have the same problem if I save a shortcut with the address of pwa. Chrome load, load, load but nothing. If I click right, refresh, the page is showed.
G
Gabriele Coroniti
Oct 9, 2019
I also add that the html code is present, but the page show white.
L
Luca Sarti
Oct 9, 2019
I have the same issue as @gabriele, i am not using angular, just pure html, css and js served by Symfony. 
This means it’s not a issue related to Angular in any way, and i have this problem only in windows machines. The async solution didn’t work form me, any suggestion?
Saeed Khamseh
Original Poster
Oct 10, 2019
Due to severity of the problem, Chrome team decided to also include fix for the issue in version 77. The stable channel has been updated to version 77.0.3865.120 with fix included; update and enjoy! 😉😊
A
A M 4182
Oct 10, 2019
Thanks to everyone involved for a quick fix! I can confirm that the update resolved the issues with our angular web app.
G
Gabriele Coroniti
Oct 11, 2019
I confirm also, with the new build the problem is not present. Thanks
M
Md Najmul Hoda
Oct 22, 2019
I save same issue in my ionic pwa. I saw above people mentioned it’s fixed in chrome version but any updates on safari?
G
Gon Abc
Oct 25, 2019
Same problem here, the PWA takes ages to load in Android when I open it from the home screen. Sometimes it loads only after a refresh is forced. Chrome version is 77.0.3865.116
Last edited Oct 25, 2019
M
Md Najmul Hoda
Nov 4, 2019
I don’t think it’s just chrome browser version issue because I am experiencing same slowness in Safari too.
Last edited Nov 4, 2019
S
Siddhartha Kumar 332
Nov 4, 2019
Figured out what the issue was for me. I had a dns prefetch in the index.html for some performance features I was working on. Removed the line and voila all works well now.

I dont know the details about others but if you have any of the resource hints in your app, I would start from there. (pre/load/connect/fetch)

https://www.keycdn.com/blog/resource-hints

EDIT: Also the start_url was incorrect for me which was a hash based route. Changed it to index.html
Last edited Nov 5, 2019
G
Gon Abc
Nov 7, 2019
Figured out my problem, too. I had CSP content violation which only happened on my mobile phone, after a few debugging by connecting the phone to remote debugger it was quite obvious that the problem lied there.
Related content
Speeding up Chrome on Android Startup with ...
Remove unwanted ads, pop-ups and malware
Fix connection and loading errors in Chrome
Speed up Google Chrome
Use web apps

    ©2026 Google Privacy Policy Terms of Service Community Policy Community Overview 

Send feedback about our Help Center

