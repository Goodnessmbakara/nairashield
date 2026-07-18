import json

with open('/tmp/wc.json') as f:
    data = f.read().strip()
    # It has the format: "compiledSource":"..."
    # Let's extract the value
    import re
    m = re.search(r'"compiledSource":"(.*?)"(?:,\s*"frontmatter"|$)', data)
    if m:
        s = m.group(1).encode('utf-8').decode('unicode_escape')
        print(s[:2000])
    else:
        print("not found")
