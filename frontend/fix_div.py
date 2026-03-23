import re

with open("src/pages/AdminDashboard.tsx", "r") as f:
    text = f.read()

# I know that the div before Stats Cards is at fault. 
text = text.replace("      </div>\n\n      {/* Stats Cards */}", "      {/* Stats Cards */}")
text = text.replace("      {/* Stats Cards */}", "      </div>\n      {/* Stats Cards */}")

with open("src/pages/AdminDashboard.tsx", "w") as f:
    f.write(text)
