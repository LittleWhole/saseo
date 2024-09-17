import collections
import html
import pathlib

INDEX = object()
INDEX_STRING = "[*]"

TYPE_TRANSLATE = {
    "dict": "object",
    "list": "array",
    "int": "integer",
    "number": "number",
    "NoneType": "null",
    "str": "string",
    "bool": "boolean",
}
THIS_DIR = pathlib.Path(__file__).parent.resolve()
CSS_FILENAME = THIS_DIR / "style.css"
TEMPLATE_FILENAME = THIS_DIR / "template.html"


def oxford_join(items, pluralize=False):
    if pluralize:
        items = [s + "s" for s in items]
    if len(items) <= 1:
        return "".join(items)
    if len(items) == 2:
        return " or ".join(items)
    return "{}, or {}".format(", ".join(items[:-1]), items[-1])


class Counter(collections.Counter):
    """The 'total' method is only available on a collections.Counter
    in python >= 3.10, so add the method to be compatible with earlier
    versions.

    """

    def total(self):
        try:
            return super().total()
        except AttributeError:
            return sum(self.values())


class TripleCounter(dict):
    def increment(self, keys, amount):
        try:
            a, b, c = keys
        except ValueError as error:
            msg = f"keys must be a tuple of length 3, got {keys!r}"
            raise ValueError(msg) from error

        if a not in self:
            self[a] = {}
        if b not in self[a]:
            self[a][b] = Counter()
        self[a][b][c] += amount

    def tree(self):
        result = {}
        for a, sub_dict in self.items():
            sub_counter = Counter()
            for b, c_counter in sub_dict.items():
                sub_counter[b] += c_counter.total()

            a_count = sub_counter.total()

            result[a] = Node(
                a,
                {
                    "count": a_count,
                    "type_counter": sub_counter,
                    "value_or_length_counter": sub_dict,
                },
            )

        root = None
        for key, node in result.items():
            if not key:
                root = node
                continue

            parent_key = key[:-1]
            parent = result[parent_key]

            node.parent = parent
            parent.children.append(node)

        return root

    def add_object(self, d):
        for keys in iter_object(d, []):
            self.increment(keys, 1)

    @classmethod
    def from_objects(cls, objects):
        counter = cls()
        for obj in objects:
            counter.add_object(obj)
        return counter

    def html(self):
        with open(TEMPLATE_FILENAME) as infile:
            html = infile.read()

        with open(CSS_FILENAME) as infile:
            css = infile.read()

        tree = self.tree()
        html = html.replace("{{style}}", css)
        html = html.replace("{{tree}}", tree.html())
        html = html.replace("{{details}}", tree.details_html())

        return html


def iter_object(d, path):
    """Traverse an object recursively, yielding triples for each node
    containing:

    0: the full path to the node
    1: the type of the node
    2: either the value of the node (for scalars) or the length of the
       node (for dict and list)

    This is intended to be used for deserialized JSONs, so it will
    throw an error for types that aren't in JSONs.

    """
    if isinstance(d, dict):
        yield tuple(path), type(d).__name__, len(d)
        for key, value in d.items():
            yield from iter_object(value, [*path, key])
    elif isinstance(d, list):
        yield tuple(path), type(d).__name__, len(d)
        for value in d:
            yield from iter_object(value, [*path, INDEX])
    elif isinstance(d, (str, bool, int, float, type(None))):
        yield tuple(path), type(d).__name__, d
    else:
        raise TypeError(f"unknown type {type(d)!r} at path {path!r}")


class Node(dict):
    def __init__(self, path, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.path = path
        self.parent = {}
        self.children = []

    def escape(self, string, truncate_length=140):
        raw = repr(string)
        if len(raw) > truncate_length:
            first = raw[: truncate_length // 2]
            second = raw[-(truncate_length // 2) :]
            length = len(raw) - len(first) - len(second)
            return (
                html.escape(first)
                + f'<span class="truncated" data-length="{length}"></span>'
                + html.escape(second)
            )
        else:
            return html.escape(raw)

    def _counter_summary_html(self, type_, counter):
        value_or_length = "value"
        if type_ == "list":
            value_or_length = "length"
        elif type_ == "dict":
            value_or_length = "number of properties"

        if len(counter) == 1:
            value, count = list(counter.items())[0]
            return f"<p>Always {value_or_length} {self.escape(value)}</p>"
        elif len(counter) <= 5:
            return (
                f"<p>{value_or_length} is "
                + oxford_join(
                    [
                        f"{self.escape(v)} {self.format_count(c)}"
                        for v, c in counter.most_common()
                    ]
                )
                + "</p>"
            )
        else:
            n_unique = len(counter)
            min_ = min(counter)
            min_count = counter[min_]
            max_ = max(counter)
            max_count = counter[max_]
            mode, mode_count = counter.most_common(1)[0]
            return f"""
<dl>
        <dt>Number of unique {value_or_length}s</dt>
        <dd>{n_unique}</dd>
        <dt>Modal {value_or_length}</dt>
        <dd>{self.escape(mode)} {self.format_count(mode_count)}</dd>
        <dt>Minimum {value_or_length}</dt>
        <dd>{self.escape(min_)} {self.format_count(min_count)}</dd>
        <dt>Maximum {value_or_length}</dt>
        <dd>{self.escape(max_)} {self.format_count(max_count)}</dd>
</dl>
        """

    def format_count(self, count, value_type=None, counter=None):  # noqa: C901
        outside = '<span class="count">{}</span>'
        if counter is None:
            inside = f"{count:,}"
        else:
            n_unique = len(counter)
            values = list(counter.most_common(3))
            if value_type == "NoneType":
                inside = f"{count:,}"
            elif value_type == "bool":
                inside = (
                    f"{count:,}, always {values[0][0]!r}"
                    if n_unique == 1
                    else f"{count:,}"
                )
            elif value_type == "int" or value_type == "number":
                if n_unique == 1:
                    inside = f"{count:,}, always {values[0][0]!r}"
                elif n_unique <= 3:
                    values_string = oxford_join([f"{k!r}" for k, v in values])
                    inside = f"{count:,}, either {values_string}"
                else:
                    inside = f"{count:,}, {n_unique:,} unique"
            elif value_type == "str":
                MAX_LENGTH_TO_SHOW = 30
                if n_unique == 1:
                    n_chars = len(values[0][0])
                    if n_chars <= MAX_LENGTH_TO_SHOW:
                        inside = f"{count:,}, always {values[0][0]!r}"
                    else:
                        inside = (
                            f"{count:,}, {n_unique:,} unique"
                            f" {n_chars:,} characters"
                        )
                elif n_unique <= 3:
                    combined = "".join(k for k, v in values)
                    if len(combined) <= MAX_LENGTH_TO_SHOW:
                        values_string = oxford_join(
                            [f"{k!r}" for k, v in values]
                        )
                        inside = f"{count:,}, either {values_string}"
                    else:
                        inside = f"{count:,}, {n_unique:,} unique"

                else:
                    inside = f"{count:,}, {n_unique:,} unique"
                pass
            elif value_type == "list":
                if n_unique == 1:
                    inside = f"{count:,}, always length {values[0][0]:,}"
                elif n_unique == 2:
                    values_string = oxford_join([f"{k:,}" for k, v in values])
                    inside = f"{count:,}, length either {values_string}"
                else:
                    inside = (
                        f"{count:,}, length between {min(counter):,} and"
                        f" {max(counter):,}"
                    )
            elif value_type == "dict":
                if n_unique == 1:
                    inside = f"{count:,}, always {values[0][0]:,} properties"
                elif n_unique == 2:
                    values_string = oxford_join([f"{k:,}" for k, v in values])
                    inside = f"{count:,}, either {values_string} properties"
                else:
                    inside = (
                        f"{count:,}, between {min(counter):,} and"
                        f" {max(counter):,} properties"
                    )
            else:
                raise ValueError(f"unknown type {value_type!r}")
        return outside.format(inside)

    def summary_html(self):
        if "float" in self["value_or_length_counter"]:
            float_counter = self["value_or_length_counter"].pop("float")
            int_counter = self["value_or_length_counter"].pop("int", {})
            for k, v in int_counter.items():
                float_counter[k] += v
            self["value_or_length_counter"]["number"] = float_counter

        html = "<div>"
        for type_, counter in self["value_or_length_counter"].items():
            html += (
                f"<h3>{TYPE_TRANSLATE[type_]} {self.format_count(counter.total())}</h3>"
            )
            html += self._counter_summary_html(type_, counter)
        html += "</div>"
        return html

    def details_html(self):
        html = f"""
<dialog id="{self.jmespath()}"><form method="dialog"><h2 class="jmespath">{self.jmespath()}</h2><div>{self.summary_html()}</div><button>Close</button></form></dialog>"""
        for child in self.children:
            html += child.details_html()
        return html

    def jmespath(self):
        parts = []
        for key in self.path:
            if key == INDEX:
                parts.append(INDEX_STRING)
            else:
                parts.append(f".{key}")
        return "".join(parts).lstrip(".")

    def format_type(self):
        if "float" in self["type_counter"]:
            float_count = self["type_counter"].pop("float")
            int_count = self["type_counter"].pop("int", 0)
            number_count = float_count + int_count
            self["type_counter"]["number"] = number_count

        if "float" in self["value_or_length_counter"]:
            float_counter = self["value_or_length_counter"].pop("float")
            int_counter = self["value_or_length_counter"].pop("int", {})
            for k, v in int_counter.items():
                float_counter[k] += v
            self["value_or_length_counter"]["number"] = float_counter

        return oxford_join(
            [
                f'{TYPE_TRANSLATE[k]} {self.format_count(v, k, self["value_or_length_counter"][k])}'
                for k, v in self["type_counter"].most_common()
            ]
        )
        # return oxford_join())

    def is_root(self):
        return not (self.path)

    def is_array(self):
        if self.is_root():
            return False
        else:
            return self.path[-1] == INDEX

    def name(self):
        name = self.path[-1] if self.path else ""
        if name == INDEX:
            name = INDEX_STRING
        return name

    def html(self, depth=0):
        item_class = "optional"
        if self.is_root():
            item_class = "root"
        elif self.is_array():
            item_class = "array"
        elif self["count"] == self.parent["count"]:
            item_class = "required"
        space = " " * 4 * (depth + 1)
        if not self.children:
            html = f"""
{space}<li class="{item_class}"><button onclick="document.getElementById('{self.jmespath()}').showModal()">Deets</button> {self.name()} <span class="type">{self.format_type()}</span></li>"""
        else:
            html = f"""
{space}<li class="{item_class}"><details class="depth-{depth}" open><summary><button onclick="document.getElementById('{self.jmespath()}').showModal()">Deets</button> {self.name()} <span class="type">{self.format_type()}</span></summary><ul>"""
            for child in self.children:
                html += child.html(depth + 1)
            html += """</ul></details></li>"""

        return html


def main2():
    d1 = {
        "a": 1,
        "b": {"c": [11, 22], "d": [1, 2, 9], "e": {"f": "a", "g": True}},
        "q": [
            {"a": 1, "b": None},
            {"a": 9, "b": [], "c": 3},
            {"a": 3, "b": [], "c": "4"},
        ],
        "tricky": [
            {"sly": 1},
            {"sly": 2},
        ],
    }
    d2 = {
        "a": [{"butter": "toast"}],
        "b": {"c": [11, 22], "d": [1, 2, 9], "e": {"f": "a", "g": True}},
        "q": [
            {"a": 1, "b": None, "c": None},
            {"a": 9, "b": [], "c": 3},
            {"a": 3, "b": [], "c": "4"},
            {"a": 5, "b": []},
        ],
        "zz": None,
        "tricky": {"joey": "joe joe"},
    }
    d3 = {
        "a": [{"butter": "snack"}],
        "b": {
            "c": [11, 22, 45],
            "d": [1, 2],
            "e": {
                "f": "g",
                "g": False,
                "h": "g",
            },
        },
        "q": [
            {"a": 10, "b": None},
            {"a": 50, "b": []},
        ],
        "tricky": "another",
    }
    d4 = list(range(10))
    counter = TripleCounter()
    counter.add_object(d1)
    counter.add_object(d2)
    counter.add_object(d3)
    counter.add_object(d4)

    # tree = counter.tree()
    print(counter.html())
