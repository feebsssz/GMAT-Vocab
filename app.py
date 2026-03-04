"""GMAT 800 Vocab Review App - Flask server."""

import json
import random

from flask import Flask, jsonify, render_template

app = Flask(__name__)

with open("vocab_data.json") as f:
    VOCAB_DATA = json.load(f)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/words")
def get_words():
    return jsonify(VOCAB_DATA)


@app.route("/api/random")
def get_random():
    return jsonify(random.choice(VOCAB_DATA))


if __name__ == "__main__":
    print(f"Loaded {len(VOCAB_DATA)} words")
    print("Access from your phone at http://<your-local-ip>:5000")
    app.run(host="0.0.0.0", port=5050, debug=True)
