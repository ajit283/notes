document.addEventListener("visibilitychange", function () {
    htmx.ajax('GET', '/', { target: "body", swap: "morph:innerHTML" });

});

window.addEventListener('focus', function () {
    htmx.ajax('GET', '/', { target: "body", swap: "morph:innerHTML" });
});