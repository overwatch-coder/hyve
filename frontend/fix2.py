import re

with open("src/pages/AdminDashboard.tsx", "r") as f:
    text = f.read()
    
# count divs
open_divs = len(re.findall(r'<div', text))
close_divs = len(re.findall(r'</div', text))
print(f"Open divs: {open_divs}")
print(f"Close divs: {close_divs}")

# count Buttons
open_btn = len(re.findall(r'<Button', text))
close_btn = len(re.findall(r'</Button', text))
print(f"Open Buttons: {open_btn}")
print(f"Close Buttons: {close_btn}")
