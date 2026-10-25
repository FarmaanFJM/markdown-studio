# Untrusted content

<script>window.parent.__pwned = 'script'; document.title = 'pwned'</script>

<img src="assets/missing.png" onerror="window.parent.__pwned = 'onerror'" alt="broken">

<iframe src="https://example.com"></iframe>

<a href="javascript:window.parent.__pwned='link'">click me</a>

<form action="https://example.com"><input type="text" name="q"><button>Send</button></form>

<p style="color: rgb(0, 128, 0)">Styled paragraph survives.</p>

<svg><a xlink:href="javascript:alert(1)"><text x="10" y="20">svg link</text></a></svg>
