let lastTime = 0;

document.addEventListener("visibilitychange", function () {
    if (window.location.pathname === '/' && Date.now() - lastTime > 1000) {
        console.log('visibilitychange')
        lastTime = Date.now();
        htmx.ajax('GET', '/', { target: "body", swap: "morph:innerHTML" }).then(() => { simpleMDE() });

    }
});



window.addEventListener('focus', function () {
    if (window.location.pathname === '/' && Date.now() - lastTime > 1000) {
        console.log('focus')
        lastTime = Date.now();
        htmx.ajax('GET', '/', { target: "body", swap: "morph:innerHTML" }).then(() => { simpleMDE() });
    }
});

window.onload = function () {
    simpleMDE();
};

function simpleMDE() {
    var simplemde = new SimpleMDE({ element: document.getElementById("textarea"), forceSync: true, autofocus: true, spellChecker: false, toolbar: false });
    simplemde.codemirror.on("change", function () {
        htmx.ajax('POST', '/edit', { target: '#textarea', swap: 'none', values: { 'text': simplemde.value() } })
    });
}