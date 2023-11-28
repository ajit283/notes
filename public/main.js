document.addEventListener("visibilitychange", function () {
    htmx.ajax('GET', '/', "body");

});

window.addEventListener('focus', function () {
    htmx.ajax('GET', '/', "body");
});