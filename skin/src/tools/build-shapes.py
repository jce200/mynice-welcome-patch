#!/usr/bin/env python3
"""build-shapes.py - the 35 Material 3 Expressive shapes as CSS clip-path polygons.

Writes ../shapes.json: {name: "polygon(x% y%, ...)"} with N_POINTS (144) points
per shape.  build-css.py pastes these strings into the --nx-v-<name> custom
properties, and the CSS morphs between shapes with `transition: clip-path`,
which only works when both polygons have the same number of points.

Keys: the 35 shapes of MaterialShapes (lowercase, alphabetical), then the legacy
aliases cookie, sun and star (the same polygons as cookie9, sunny and burst).  The
order is fixed on purpose, see to_json_dict().

Run it from anywhere (paths are resolved from this file):

    python3 skin/src/tools/build-shapes.py [--out FILE]

Python 3, standard library only, deterministic.

Attribution and licence
-----------------------
The geometry in this file (the vertex coordinates and CornerRounding values of
the 35 shapes, the rounded-corner / flanking-curve construction, the star,
circle, rectangle, pill and pillStar builders, the repeat / mirroring helpers
and normalized()) follows androidx.compose.material3.MaterialShapes and
androidx.graphics.shapes, Copyright 2022-2024 The Android Open Source Project,
licensed under the Apache License, Version 2.0
(https://www.apache.org/licenses/LICENSE-2.0).  This file is an independent
Python port written for this project, not a copy of the Kotlin source.  Names
follow the original so the two can be compared side by side.  Differences:
64-bit floats instead of 32-bit, no Morph / feature-mapping code, and the
sampling of the finished outline into clip-path points (part 3) is new code.

Layout of this file
-------------------
  part 1  androidx.graphics.shapes: Point, Cubic, RoundedCorner, RoundedPolygon,
          and the star / circle / rectangle / pill / pillStar builders
  part 2  MaterialShapes: customPolygon / doRepeat and the 35 definitions
  part 3  outline -> 144 clip-path points (equal-angle or equal-arc-length)
  part 4  command line
"""

import argparse
import bisect
import json
import math
import os
import sys
from collections import OrderedDict, namedtuple

N_POINTS = 144        # points per polygon; identical for every shape so that CSS can morph
SUBDIV = 256          # dense polyline samples per cubic (geometry queries only)
CENTER = (0.5, 0.5)   # centre of the normalized() box: ray origin for the sampling
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, '..', 'shapes.json'))

# ===========================================================================
# part 1 - androidx.graphics.shapes
# ===========================================================================

DISTANCE_EPSILON = 1e-4                    # Utils.kt DistanceEpsilon
TWO_PI = 2.0 * math.pi
FLOAT_MIN_VALUE = 1.401298464324817e-45    # Kotlin Float.MIN_VALUE: the smallest *positive* float


class Point(object):
    """2D point / vector with the operators the Kotlin sources use (Point.kt)."""
    __slots__ = ('x', 'y')

    def __init__(self, x, y):
        self.x = float(x)
        self.y = float(y)

    def __add__(self, o):
        return Point(self.x + o.x, self.y + o.y)

    def __sub__(self, o):
        return Point(self.x - o.x, self.y - o.y)

    def __mul__(self, k):
        return Point(self.x * k, self.y * k)

    def __truediv__(self, k):
        return Point(self.x / k, self.y / k)

    def __repr__(self):
        return 'Point(%r, %r)' % (self.x, self.y)

    def get_distance(self):
        return math.sqrt(self.x * self.x + self.y * self.y)

    def dot_product(self, o):
        return self.x * o.x + self.y * o.y

    def clockwise(self, o):
        """True if `o` turns clockwise from this vector (z of the cross product > 0)."""
        return self.x * o.y - self.y * o.x > 0

    def get_direction(self):
        d = self.get_distance()
        if not d > 0:
            raise ValueError("Can't get the direction of a 0-length vector")
        return self / d

    def rotate90(self):
        return Point(-self.y, self.x)


ZERO = Point(0.0, 0.0)


def distance(x, y):
    return math.sqrt(x * x + y * y)


def direction_vector(x, y):
    """Unit vector in the direction of (x, y)."""
    d = distance(x, y)
    if not d > 0:
        raise ValueError('Required distance greater than zero')
    return Point(x / d, y / d)


def radial_to_cartesian(radius, angle_radians, center=ZERO):
    return Point(math.cos(angle_radians), math.sin(angle_radians)) * radius + center


def interpolate(start, stop, fraction):
    """Linear interpolation of floats or Points (Utils.kt / Point.kt)."""
    if isinstance(start, Point):
        return Point(interpolate(start.x, stop.x, fraction), interpolate(start.y, stop.y, fraction))
    return (1 - fraction) * start + fraction * stop


def convex(previous, current, nxt):
    """Utils.kt convex(): does the corner at `current` turn clockwise?"""
    return (current - previous).clockwise(nxt - current)


class CornerRounding(object):
    """CornerRounding.kt: circle radius of a rounded corner plus 0..1 smoothing."""
    __slots__ = ('radius', 'smoothing')

    def __init__(self, radius=0.0, smoothing=0.0):
        self.radius = float(radius)
        self.smoothing = float(smoothing)


UNROUNDED = CornerRounding()


class Cubic(object):
    """Cubic.kt: anchor0, control0, control1, anchor1 as eight floats."""
    __slots__ = ('p',)

    def __init__(self, points):
        if len(points) != 8:
            raise ValueError('Points array size should be 8')
        self.p = tuple(float(v) for v in points)

    anchor0_x = property(lambda self: self.p[0])
    anchor0_y = property(lambda self: self.p[1])
    control0_x = property(lambda self: self.p[2])
    control0_y = property(lambda self: self.p[3])
    control1_x = property(lambda self: self.p[4])
    control1_y = property(lambda self: self.p[5])
    anchor1_x = property(lambda self: self.p[6])
    anchor1_y = property(lambda self: self.p[7])

    @classmethod
    def from_points(cls, anchor0, control0, control1, anchor1):
        return cls([anchor0.x, anchor0.y, control0.x, control0.y,
                    control1.x, control1.y, anchor1.x, anchor1.y])

    def xy(self, t):
        """Point on the curve at parameter t, as an (x, y) tuple."""
        p = self.p
        u = 1 - t
        a, b, c, d = u * u * u, 3 * t * u * u, 3 * t * t * u, t * t * t
        return (p[0] * a + p[2] * b + p[4] * c + p[6] * d,
                p[1] * a + p[3] * b + p[5] * c + p[7] * d)

    def point_on_curve(self, t):
        x, y = self.xy(t)
        return Point(x, y)

    def zero_length(self):
        return (abs(self.anchor0_x - self.anchor1_x) < DISTANCE_EPSILON and
                abs(self.anchor0_y - self.anchor1_y) < DISTANCE_EPSILON)

    def calculate_bounds(self, approximate=False):
        """(left, top, right, bottom).  `approximate` uses the hull of all four points."""
        if self.zero_length():
            return (self.anchor0_x, self.anchor0_y, self.anchor0_x, self.anchor0_y)
        min_x = min(self.anchor0_x, self.anchor1_x)
        min_y = min(self.anchor0_y, self.anchor1_y)
        max_x = max(self.anchor0_x, self.anchor1_x)
        max_y = max(self.anchor0_y, self.anchor1_y)
        if approximate:
            return (min(min_x, min(self.control0_x, self.control1_x)),
                    min(min_y, min(self.control0_y, self.control1_y)),
                    max(max_x, max(self.control0_x, self.control1_x)),
                    max(max_y, max(self.control0_y, self.control1_y)))
        # exact: solve the derivative (a quadratic) for each axis
        min_x, max_x = self._extremes(0, min_x, max_x)
        min_y, max_y = self._extremes(1, min_y, max_y)
        return (min_x, min_y, max_x, max_y)

    def _extremes(self, axis, lo, hi):
        a0, c0, c1, a1 = self.p[axis], self.p[2 + axis], self.p[4 + axis], self.p[6 + axis]
        qa = -a0 + 3 * c0 - 3 * c1 + a1
        qb = 2 * a0 - 4 * c0 + 2 * c1
        qc = -a0 + c0
        roots = []
        if abs(qa) < DISTANCE_EPSILON:
            if qb != 0:
                roots.append(2 * qc / (-2 * qb))
        else:
            disc = qb * qb - 4 * qa * qc
            if disc >= 0:
                roots.append((-qb + math.sqrt(disc)) / (2 * qa))
                roots.append((-qb - math.sqrt(disc)) / (2 * qa))
        for t in roots:
            if 0.0 <= t <= 1.0:
                v = self.xy(t)[axis]
                lo = min(lo, v)
                hi = max(hi, v)
        return lo, hi

    def split(self, t):
        """Two cubics, split at parameter t."""
        a0x, a0y, c0x, c0y, c1x, c1y, a1x, a1y = self.p
        u = 1 - t
        pc = self.point_on_curve(t)
        first = Cubic([a0x, a0y,
                       a0x * u + c0x * t, a0y * u + c0y * t,
                       a0x * (u * u) + c0x * (2 * u * t) + c1x * (t * t),
                       a0y * (u * u) + c0y * (2 * u * t) + c1y * (t * t),
                       pc.x, pc.y])
        second = Cubic([pc.x, pc.y,
                        c0x * (u * u) + c1x * (2 * u * t) + a1x * (t * t),
                        c0y * (u * u) + c1y * (2 * u * t) + a1y * (t * t),
                        c1x * u + a1x * t, c1y * u + a1y * t,
                        a1x, a1y])
        return first, second

    def reverse(self):
        a0x, a0y, c0x, c0y, c1x, c1y, a1x, a1y = self.p
        return Cubic([a1x, a1y, c1x, c1y, c0x, c0y, a0x, a0y])

    def transformed(self, f):
        """f(x, y) -> (x', y'), applied to all four points."""
        out = []
        for i in range(0, 8, 2):
            out.extend(f(self.p[i], self.p[i + 1]))
        return Cubic(out)


def straight_line(x0, y0, x1, y1):
    """Cubic.straightLine: control points a third of the way along."""
    return Cubic([x0, y0,
                  interpolate(x0, x1, 1.0 / 3.0), interpolate(y0, y1, 1.0 / 3.0),
                  interpolate(x0, x1, 2.0 / 3.0), interpolate(y0, y1, 2.0 / 3.0),
                  x1, y1])


def circular_arc(center_x, center_y, x0, y0, x1, y1):
    """Cubic.circularArc: the shorter circular arc from p0 to p1 around the centre."""
    p0d = direction_vector(x0 - center_x, y0 - center_y)
    p1d = direction_vector(x1 - center_x, y1 - center_y)
    rotated_p0 = p0d.rotate90()
    rotated_p1 = p1d.rotate90()
    clockwise = rotated_p0.dot_product(Point(x1 - center_x, y1 - center_y)) >= 0
    cosa = p0d.dot_product(p1d)
    if cosa > 0.999:   # p0 ~= p1
        return straight_line(x0, y0, x1, y1)
    k = (distance(x0 - center_x, y0 - center_y) * 4.0 / 3.0 *
         (math.sqrt(2 * (1 - cosa)) - math.sqrt(max(0.0, 1 - cosa * cosa))) / (1 - cosa) *
         (1.0 if clockwise else -1.0))
    return Cubic([x0, y0,
                  x0 + rotated_p0.x * k, y0 + rotated_p0.y * k,
                  x1 - rotated_p1.x * k, y1 - rotated_p1.y * k,
                  x1, y1])


class Feature(object):
    """Features.kt: a run of cubics that is either an edge or a (convex / concave) corner."""
    __slots__ = ('cubics', 'is_corner', 'convex')

    def __init__(self, cubics, is_corner, convex=True):
        self.cubics = cubics
        self.is_corner = is_corner
        self.convex = convex

    def transformed(self, f):
        return Feature([c.transformed(f) for c in self.cubics], self.is_corner, self.convex)


class RoundedCorner(object):
    """RoundedPolygon.kt RoundedCorner: one vertex of a polygon and how it is rounded.

    The rounding is a circular arc of `corner_radius` tangent to both sides; with
    smoothing > 0 the arc is flanked by two extra cubics that blend it into the
    straight sides.  Done in two steps: first how much we would like to cut
    (expected_round_cut / expected_cut), then get_cubics() with how much the
    neighbouring corners actually leave us.
    """

    def __init__(self, p0, p1, p2, rounding):
        self.p0, self.p1, self.p2 = p0, p1, p2
        v01 = p0 - p1
        v21 = p2 - p1
        d01 = v01.get_distance()
        d21 = v21.get_distance()
        if d01 > 0 and d21 > 0:
            self.d1 = v01 / d01
            self.d2 = v21 / d21
            self.corner_radius = rounding.radius
            self.smoothing = rounding.smoothing
            self.cos_angle = self.d1.dot_product(self.d2)
            self.sin_angle = math.sqrt(max(0.0, 1 - self.cos_angle * self.cos_angle))
            # tan(A/2) = sinA / (1 + cosA) = radius / cut
            if self.sin_angle > 1e-3:
                self.expected_round_cut = self.corner_radius * (self.cos_angle + 1) / self.sin_angle
            else:
                self.expected_round_cut = 0.0
        else:   # one (or both) of the sides is empty, nothing to round
            self.d1 = Point(0.0, 0.0)
            self.d2 = Point(0.0, 0.0)
            self.corner_radius = 0.0
            self.smoothing = 0.0
            self.cos_angle = 0.0
            self.sin_angle = 0.0
            self.expected_round_cut = 0.0
        self.center = Point(0.0, 0.0)

    @property
    def expected_cut(self):
        # smoothing changes the actual cut: 0 is the same as expected_round_cut, 1 doubles it
        return (1 + self.smoothing) * self.expected_round_cut

    def get_cubics(self, allowed_cut0, allowed_cut1=None):
        if allowed_cut1 is None:
            allowed_cut1 = allowed_cut0
        # the smaller of both cuts decides the radius; extra room on one side goes to smoothing
        allowed_cut = min(allowed_cut0, allowed_cut1)
        if (self.expected_round_cut < DISTANCE_EPSILON or allowed_cut < DISTANCE_EPSILON or
                self.corner_radius < DISTANCE_EPSILON):
            self.center = self.p1
            return [straight_line(self.p1.x, self.p1.y, self.p1.x, self.p1.y)]
        actual_round_cut = min(allowed_cut, self.expected_round_cut)
        # space is used for rounding first; smoothing only gets what is left over
        actual_smoothing0 = self._actual_smoothing(allowed_cut0)
        actual_smoothing1 = self._actual_smoothing(allowed_cut1)
        actual_r = self.corner_radius * actual_round_cut / self.expected_round_cut
        center_distance = math.sqrt(actual_r * actual_r + actual_round_cut * actual_round_cut)
        self.center = self.p1 + ((self.d1 + self.d2) / 2.0).get_direction() * center_distance
        circle_intersection0 = self.p1 + self.d1 * actual_round_cut
        circle_intersection2 = self.p1 + self.d2 * actual_round_cut
        flanking0 = self._flanking_curve(actual_round_cut, actual_smoothing0, self.p1, self.p0,
                                         circle_intersection0, circle_intersection2,
                                         self.center, actual_r)
        flanking2 = self._flanking_curve(actual_round_cut, actual_smoothing1, self.p1, self.p2,
                                         circle_intersection2, circle_intersection0,
                                         self.center, actual_r).reverse()
        return [flanking0,
                circular_arc(self.center.x, self.center.y, flanking0.anchor1_x, flanking0.anchor1_y,
                             flanking2.anchor0_x, flanking2.anchor0_y),
                flanking2]

    def _actual_smoothing(self, allowed_cut):
        if allowed_cut > self.expected_cut:
            return self.smoothing
        if allowed_cut > self.expected_round_cut:
            return (self.smoothing * (allowed_cut - self.expected_round_cut) /
                    (self.expected_cut - self.expected_round_cut))
        return 0.0

    @staticmethod
    def _flanking_curve(actual_round_cut, smoothing, corner, side_start,
                        circle_segment_intersection, other_circle_segment_intersection,
                        circle_center, actual_r):
        """Bezier from the straight side (starting `cut * (1 + smoothing)` from the corner)
        to a point on the rounding circle, tangent to both."""
        side_direction = (side_start - corner).get_direction()
        curve_start = corner + side_direction * actual_round_cut * (1 + smoothing)
        # take a part of the circle section proportional to 1 - smoothing
        p = interpolate(circle_segment_intersection,
                        (circle_segment_intersection + other_circle_segment_intersection) / 2.0,
                        smoothing)
        curve_end = circle_center + direction_vector(p.x - circle_center.x,
                                                     p.y - circle_center.y) * actual_r
        # the anchor on the circle side: tangent to the circle at curve_end meets the side
        circle_tangent = (curve_end - circle_center).rotate90()
        anchor_end = RoundedCorner._line_intersection(side_start, side_direction,
                                                      curve_end, circle_tangent)
        if anchor_end is None:
            anchor_end = circle_segment_intersection
        anchor_start = (curve_start + anchor_end * 2.0) / 3.0
        return Cubic.from_points(curve_start, anchor_start, anchor_end, curve_end)

    @staticmethod
    def _line_intersection(p0, d0, p1, d1):
        """Intersection of the lines p0 + k*d0 and the one through p1 with direction d1 (or None)."""
        rotated_d1 = d1.rotate90()
        den = d0.dot_product(rotated_d1)
        if abs(den) < DISTANCE_EPSILON:
            return None
        num = (p1 - p0).dot_product(rotated_d1)
        if abs(den) < DISTANCE_EPSILON * abs(num):
            return None
        return p0 + d0 * (num / den)


class RoundedPolygon(object):
    """RoundedPolygon.kt: features (edges and rounded corners) plus the polygon centre."""

    def __init__(self, features, center):
        self.features = features
        self.center = center
        self.cubics = self._flatten()
        prev = self.cubics[-1]
        for cubic in self.cubics:
            if (abs(cubic.anchor0_x - prev.anchor1_x) > DISTANCE_EPSILON or
                    abs(cubic.anchor0_y - prev.anchor1_y) > DISTANCE_EPSILON):
                raise ValueError('RoundedPolygon must be contiguous, with the anchor points of '
                                 'all curves matching the anchor points of the preceding and '
                                 'succeeding cubics')
            prev = cubic

    @property
    def center_x(self):
        return self.center.x

    @property
    def center_y(self):
        return self.center.y

    def _flatten(self):
        """The cubics list: features flattened, zero-length curves dropped, first corner split."""
        features = self.features
        out = []
        first_cubic = None
        last_cubic = None
        split_start = None
        split_end = None
        if len(features) > 0 and len(features[0].cubics) == 3:
            # start the path in the middle of the first corner so the first/last anchors match
            start, end = features[0].cubics[1].split(0.5)
            split_start = [features[0].cubics[0], start]
            split_end = [end, features[0].cubics[2]]
        for i in range(len(features) + 1):
            if i == 0 and split_end is not None:
                feature_cubics = split_end
            elif i == len(features):
                if split_start is None:
                    break
                feature_cubics = split_start
            else:
                feature_cubics = features[i].cubics
            for cubic in feature_cubics:
                if not cubic.zero_length():
                    if last_cubic is not None:
                        out.append(last_cubic)
                    last_cubic = cubic
                    if first_cubic is None:
                        first_cubic = cubic
                elif last_cubic is not None:
                    # dropping several zero-ish curves in a row can add up to a visible gap,
                    # so the last kept cubic always ends at the latest anchor
                    pts = list(last_cubic.p)
                    pts[6] = cubic.anchor1_x
                    pts[7] = cubic.anchor1_y
                    last_cubic = Cubic(pts)
        if last_cubic is not None and first_cubic is not None:
            out.append(Cubic([last_cubic.anchor0_x, last_cubic.anchor0_y,
                              last_cubic.control0_x, last_cubic.control0_y,
                              last_cubic.control1_x, last_cubic.control1_y,
                              first_cubic.anchor0_x, first_cubic.anchor0_y]))
        else:   # empty / 0-sized polygon
            cx, cy = self.center.x, self.center.y
            out.append(Cubic([cx, cy, cx, cy, cx, cy, cx, cy]))
        return out

    def transformed(self, f):
        """f(x, y) -> (x', y'); returns a new RoundedPolygon."""
        cx, cy = f(self.center.x, self.center.y)
        return RoundedPolygon([feat.transformed(f) for feat in self.features], Point(cx, cy))

    def calculate_bounds(self, approximate=True):
        """(left, top, right, bottom); `approximate` = hull of all anchors and controls."""
        min_x = min_y = float('inf')   # Float.MAX_VALUE
        # Kotlin starts the maxima at Float.MIN_VALUE (tiny positive).  Same here; it only
        # matters for shapes lying entirely in negative coordinates, of which there are none.
        max_x = max_y = FLOAT_MIN_VALUE
        for cubic in self.cubics:
            left, top, right, bottom = cubic.calculate_bounds(approximate)
            min_x = min(min_x, left)
            min_y = min(min_y, top)
            max_x = max(max_x, right)
            max_y = max(max_y, bottom)
        return (min_x, min_y, max_x, max_y)

    def normalized(self):
        """Moved and scaled to lie inside (0, 0)-(1, 1), centred if not square.

        Like Google's, this uses the *approximate* bounds (hull of all control points),
        so curved shapes stay a little inside the box.
        """
        left, top, right, bottom = self.calculate_bounds()
        width = right - left
        height = bottom - top
        side = max(width, height)
        offset_x = (side - width) / 2 - left
        offset_y = (side - height) / 2 - top
        return self.transformed(lambda x, y: ((x + offset_x) / side, (y + offset_y) / side))


def calculate_center(vertices):
    """Average of the vertices (used when no centre is given)."""
    n = len(vertices) // 2
    return Point(sum(vertices[0::2]) / n, sum(vertices[1::2]) / n)


def rounded_polygon(vertices, rounding=UNROUNDED, per_vertex_rounding=None,
                    center_x=None, center_y=None):
    """RoundedPolygon(vertices: FloatArray, ...): vertices is a flat [x0, y0, x1, y1, ...] list."""
    if len(vertices) < 6:
        raise ValueError('Polygons must have at least 3 vertices')
    if len(vertices) % 2 == 1:
        raise ValueError('The vertices array should have even size')
    if per_vertex_rounding is not None and len(per_vertex_rounding) * 2 != len(vertices):
        raise ValueError('perVertexRounding list should be either null or the same size as '
                         'the number of vertices (vertices.size / 2)')
    n = len(vertices) // 2

    def vertex(i):
        return Point(vertices[i * 2], vertices[i * 2 + 1])

    rounded_corners = []
    for i in range(n):
        vtx_rounding = per_vertex_rounding[i] if per_vertex_rounding is not None else rounding
        rounded_corners.append(RoundedCorner(vertex((i + n - 1) % n), vertex(i),
                                             vertex((i + 1) % n), vtx_rounding))

    # For each side (corner i to corner i+1) check there is room for the cuts; if not, share
    # the space: first for the round cuts, then for smoothing with what is left.
    # Each entry: (share of expected_round_cut we can do, share of the smoothing part we can do)
    cut_adjusts = []
    for ix in range(n):
        expected_round_cut = (rounded_corners[ix].expected_round_cut +
                              rounded_corners[(ix + 1) % n].expected_round_cut)
        expected_cut = rounded_corners[ix].expected_cut + rounded_corners[(ix + 1) % n].expected_cut
        a, b = vertex(ix), vertex((ix + 1) % n)
        side_size = distance(a.x - b.x, a.y - b.y)
        if expected_round_cut > side_size:      # not enough room for full rounding
            cut_adjusts.append((side_size / expected_round_cut, 0.0))
        elif expected_cut > side_size:          # full rounding, partial smoothing
            cut_adjusts.append((1.0, (side_size - expected_round_cut) /
                                (expected_cut - expected_round_cut)))
        else:                                   # room for rounding and smoothing
            cut_adjusts.append((1.0, 1.0))

    corners = []
    for i in range(n):
        allowed_cuts = []   # [0]: side from the previous corner to this one, [1]: to the next
        for delta in (0, 1):
            round_cut_ratio, cut_ratio = cut_adjusts[(i + n - 1 + delta) % n]
            rc = rounded_corners[i]
            allowed_cuts.append(rc.expected_round_cut * round_cut_ratio +
                                (rc.expected_cut - rc.expected_round_cut) * cut_ratio)
        corners.append(rounded_corners[i].get_cubics(allowed_cuts[0], allowed_cuts[1]))

    features = []
    for i in range(n):
        features.append(Feature(corners[i], True, convex(vertex((i + n - 1) % n), vertex(i),
                                                          vertex((i + 1) % n))))
        nxt = corners[(i + 1) % n]
        features.append(Feature([straight_line(corners[i][-1].anchor1_x, corners[i][-1].anchor1_y,
                                               nxt[0].anchor0_x, nxt[0].anchor0_y)], False))

    if center_x is None or center_y is None:
        center = calculate_center(vertices)
    else:
        center = Point(center_x, center_y)
    return RoundedPolygon(features, center)


def _vertices_from_num_verts(num_vertices, radius, center_x, center_y):
    out = []
    for i in range(num_vertices):
        v = radial_to_cartesian(radius, math.pi / num_vertices * 2 * i) + Point(center_x, center_y)
        out.extend([v.x, v.y])
    return out


def polygon(num_vertices, radius=1.0, center_x=0.0, center_y=0.0,
            rounding=UNROUNDED, per_vertex_rounding=None):
    """RoundedPolygon(numVertices, ...): regular polygon, first vertex at angle 0 (3 o'clock)."""
    return rounded_polygon(_vertices_from_num_verts(num_vertices, radius, center_x, center_y),
                           rounding, per_vertex_rounding, center_x, center_y)


# --- Shapes.kt -------------------------------------------------------------

def circle(num_vertices=8, radius=1.0, center_x=0.0, center_y=0.0):
    """RoundedPolygon.circle: a polygon whose corners are rounded by the circle's radius."""
    if num_vertices < 3:
        raise ValueError('Circle must have at least three vertices')
    theta = math.pi / num_vertices
    polygon_radius = radius / math.cos(theta)
    return polygon(num_vertices, radius=polygon_radius, center_x=center_x, center_y=center_y,
                   rounding=CornerRounding(radius))


def rectangle(width=2.0, height=2.0, rounding=UNROUNDED, per_vertex_rounding=None,
              center_x=0.0, center_y=0.0):
    """RoundedPolygon.rectangle; vertex order: bottom-right, bottom-left, top-left, top-right."""
    left = center_x - width / 2
    top = center_y - height / 2
    right = center_x + width / 2
    bottom = center_y + height / 2
    return rounded_polygon([right, bottom, left, bottom, left, top, right, top],
                           rounding, per_vertex_rounding, center_x, center_y)


def _star_vertices(num_vertices_per_radius, radius, inner_radius, center_x, center_y):
    out = []
    for i in range(num_vertices_per_radius):
        v = radial_to_cartesian(radius, math.pi / num_vertices_per_radius * 2 * i)
        out.extend([v.x + center_x, v.y + center_y])
        v = radial_to_cartesian(inner_radius, math.pi / num_vertices_per_radius * (2 * i + 1))
        out.extend([v.x + center_x, v.y + center_y])
    return out


def star(num_vertices_per_radius, radius=1.0, inner_radius=0.5, rounding=UNROUNDED,
         inner_rounding=None, per_vertex_rounding=None, center_x=0.0, center_y=0.0):
    """RoundedPolygon.star: alternating outer / inner vertices, first outer one at angle 0."""
    if radius <= 0 or inner_radius <= 0:
        raise ValueError('Star radii must both be greater than 0')
    if inner_radius >= radius:
        raise ValueError('innerRadius must be less than radius')
    pv_rounding = per_vertex_rounding
    if pv_rounding is None and inner_rounding is not None:
        pv_rounding = [r for _ in range(num_vertices_per_radius) for r in (rounding, inner_rounding)]
    return rounded_polygon(_star_vertices(num_vertices_per_radius, radius, inner_radius,
                                          center_x, center_y),
                           rounding, pv_rounding, center_x, center_y)


def pill(width=2.0, height=1.0, smoothing=0.0, center_x=0.0, center_y=0.0):
    """RoundedPolygon.pill: a rectangle capped by two half circles."""
    if not (width > 0 and height > 0):
        raise ValueError('Pill shapes must have positive width and height')
    w_half = width / 2
    h_half = height / 2
    return rounded_polygon([w_half + center_x, h_half + center_y,
                            -w_half + center_x, h_half + center_y,
                            -w_half + center_x, -h_half + center_y,
                            w_half + center_x, -h_half + center_y],
                           rounding=CornerRounding(min(w_half, h_half), smoothing),
                           center_x=center_x, center_y=center_y)


def _pill_star_vertices(num_vertices_per_radius, width, height, inner_radius, vertex_spacing,
                        start_location, center_x, center_y):
    # Walk the perimeter of the underlying pill in equal steps of t and place each vertex
    # according to the section (side edge, corner arc or top / bottom edge) that t falls in.
    endcap_radius = min(width, height)
    v_seg_len = max(height - width, 0.0)
    h_seg_len = max(width - height, 0.0)
    v_seg_half = v_seg_len / 2
    h_seg_half = h_seg_len / 2
    circle_perimeter = TWO_PI * endcap_radius * interpolate(inner_radius, 1.0, vertex_spacing)
    perimeter = 2 * h_seg_len + 2 * v_seg_len + circle_perimeter
    sections = [0.0] * 11
    sections[1] = v_seg_len / 2
    sections[2] = sections[1] + circle_perimeter / 4
    sections[3] = sections[2] + h_seg_len
    sections[4] = sections[3] + circle_perimeter / 4
    sections[5] = sections[4] + v_seg_len
    sections[6] = sections[5] + circle_perimeter / 4
    sections[7] = sections[6] + h_seg_len
    sections[8] = sections[7] + circle_perimeter / 4
    sections[9] = sections[8] + v_seg_len / 2
    sections[10] = perimeter
    t_per_vertex = perimeter / (2 * num_vertices_per_radius)
    inner = False
    curr_sec = 0
    sec_start = 0.0
    sec_end = sections[1]
    t = start_location * perimeter
    rect_br = Point(h_seg_half, v_seg_half)
    rect_bl = Point(-h_seg_half, v_seg_half)
    rect_tl = Point(-h_seg_half, -v_seg_half)
    rect_tr = Point(h_seg_half, -v_seg_half)
    result = []
    for _ in range(num_vertices_per_radius * 2):
        bounded_t = t % perimeter
        if bounded_t < sec_start:
            curr_sec = 0
        while bounded_t >= sections[(curr_sec + 1) % len(sections)]:
            curr_sec = (curr_sec + 1) % len(sections)
            sec_start = sections[curr_sec]
            sec_end = sections[(curr_sec + 1) % len(sections)]
        t_proportion = (bounded_t - sec_start) / (sec_end - sec_start)
        r = endcap_radius * inner_radius if inner else endcap_radius
        if curr_sec == 0:
            v = Point(r, t_proportion * v_seg_half)
        elif curr_sec == 1:
            v = radial_to_cartesian(r, t_proportion * math.pi / 2) + rect_br
        elif curr_sec == 2:
            v = Point(h_seg_half - t_proportion * h_seg_len, r)
        elif curr_sec == 3:
            v = radial_to_cartesian(r, math.pi / 2 + t_proportion * math.pi / 2) + rect_bl
        elif curr_sec == 4:
            v = Point(-r, v_seg_half - t_proportion * v_seg_len)
        elif curr_sec == 5:
            v = radial_to_cartesian(r, math.pi + t_proportion * math.pi / 2) + rect_tl
        elif curr_sec == 6:
            v = Point(-h_seg_half + t_proportion * h_seg_len, -r)
        elif curr_sec == 7:
            v = radial_to_cartesian(r, math.pi * 1.5 + t_proportion * math.pi / 2) + rect_tr
        else:
            v = Point(r, -v_seg_half + t_proportion * v_seg_half)
        result.extend([v.x + center_x, v.y + center_y])
        t += t_per_vertex
        inner = not inner
    return result


def pill_star(width=2.0, height=1.0, num_vertices_per_radius=8, inner_radius_ratio=0.5,
              rounding=UNROUNDED, inner_rounding=None, per_vertex_rounding=None,
              vertex_spacing=0.5, start_location=0.0, center_x=0.0, center_y=0.0):
    """RoundedPolygon.pillStar: a star whose outline follows a pill instead of a circle."""
    if not (width > 0 and height > 0):
        raise ValueError('Pill shapes must have positive width and height')
    if not (0 < inner_radius_ratio <= 1):
        raise ValueError('innerRadius must be between 0 and 1')
    pv_rounding = per_vertex_rounding
    if pv_rounding is None and inner_rounding is not None:
        pv_rounding = [r for _ in range(num_vertices_per_radius) for r in (rounding, inner_rounding)]
    return rounded_polygon(_pill_star_vertices(num_vertices_per_radius, width, height,
                                               inner_radius_ratio, vertex_spacing, start_location,
                                               center_x, center_y),
                           rounding, pv_rounding, center_x, center_y)


# ===========================================================================
# part 2 - androidx.compose.material3.MaterialShapes
# ===========================================================================

class Matrix(object):
    """The 2D part of Compose's Matrix, enough for the Matrix().apply { ... } calls below.

    Compose lays the values out so that a point maps to
    (m00*x + m10*y, m01*x + m11*y); rotateZ(a) on the identity gives the usual rotation
    (x cos a - y sin a, x sin a + y cos a), which is clockwise on screen for a > 0 because
    y points down.
    """

    def __init__(self, m00=1.0, m01=0.0, m10=0.0, m11=1.0):
        self.m00, self.m01, self.m10, self.m11 = m00, m01, m10, m11

    @classmethod
    def rotate_z(cls, degrees):
        r = math.radians(degrees)
        s, c = math.sin(r), math.cos(r)
        return cls(c, s, -s, c)

    @classmethod
    def scale(cls, sx, sy):
        return cls(sx, 0.0, 0.0, sy)

    def map(self, x, y):
        return (self.m00 * x + self.m10 * y, self.m01 * x + self.m11 * y)


def transformed(poly, matrix):
    """RoundedPolygon.transformed(Matrix)."""
    return poly.transformed(matrix.map)


R15 = CornerRounding(0.15)
R20 = CornerRounding(0.2)
R30 = CornerRounding(0.3)
R50 = CornerRounding(0.5)
R100 = CornerRounding(1.0)

ROTATE_NEG_45 = Matrix.rotate_z(-45.0)
ROTATE_NEG_90 = Matrix.rotate_z(-90.0)
ROTATE_NEG_135 = Matrix.rotate_z(-135.0)

PointNRound = namedtuple('PointNRound', 'x y r')


def pnr(x, y, radius=0.0, smoothing=0.0):
    """PointNRound(Offset(x, y), CornerRounding(radius, smoothing))."""
    return PointNRound(float(x), float(y), CornerRounding(radius, smoothing))


def _rotate_degrees(x, y, angle, cx, cy):
    a = math.radians(angle)
    ox, oy = x - cx, y - cy
    return (ox * math.cos(a) - oy * math.sin(a) + cx, ox * math.sin(a) + oy * math.cos(a) + cy)


def do_repeat(points, reps, center, mirroring):
    """MaterialShapes.doRepeat: copies of the points around the centre.

    Without mirroring the point list is rotated by 360/reps for each copy.  With
    mirroring there are 2*reps sections of 360/(2*reps) degrees; odd sections hold the
    mirror image (in reverse order, without the first point) of the even ones.
    """
    cx, cy = center
    out = []
    if mirroring:
        angles = [math.degrees(math.atan2(p.y - cy, p.x - cx)) for p in points]
        distances = [distance(p.x - cx, p.y - cy) for p in points]
        actual_reps = reps * 2
        section_angle = 360.0 / actual_reps
        last = len(points) - 1
        for it in range(actual_reps):
            for index in range(len(points)):
                i = index if it % 2 == 0 else last - index
                if i > 0 or it % 2 == 0:
                    if it % 2 == 0:
                        a = section_angle * it + angles[i]
                    else:
                        a = section_angle * it + (section_angle - angles[i] + 2 * angles[0])
                    a = math.radians(a)
                    out.append(PointNRound(math.cos(a) * distances[i] + cx,
                                           math.sin(a) * distances[i] + cy, points[i].r))
    else:
        np_ = len(points)
        for it in range(np_ * reps):
            p = points[it % np_]
            x, y = _rotate_degrees(p.x, p.y, (it // np_) * 360.0 / reps, cx, cy)
            out.append(PointNRound(x, y, p.r))
    return out


def custom_polygon(points, reps, center=CENTER, mirroring=False):
    """MaterialShapes.customPolygon: repeat `points` around `center`, build the polygon."""
    actual = do_repeat(points, reps, center, mirroring)
    vertices = []
    for p in actual:
        vertices.extend([p.x, p.y])
    return rounded_polygon(vertices, per_vertex_rounding=[p.r for p in actual],
                           center_x=center[0], center_y=center[1])


# --- the 35 definitions (same order as MaterialShapes.kt) -------------------

def m_circle(num_vertices=10):
    return circle(num_vertices=num_vertices)


def m_square():
    return rectangle(width=1.0, height=1.0, rounding=R30)


def m_slanted():
    return custom_polygon([pnr(0.926, 0.970, 0.189, 0.811),
                           pnr(-0.021, 0.967, 0.187, 0.057)], 2)


def m_arch():
    return transformed(polygon(4, per_vertex_rounding=[R100, R100, R20, R20]), ROTATE_NEG_135)


def m_fan():
    return custom_polygon([pnr(1.004, 1.000, 0.148, 0.417),
                           pnr(0.000, 1.000, 0.151),
                           pnr(0.000, -0.003, 0.148),
                           pnr(0.978, 0.020, 0.803)], 1)


def m_arrow():
    return custom_polygon([pnr(0.500, 0.892, 0.313),
                           pnr(-0.216, 1.050, 0.207),
                           pnr(0.499, -0.160, 0.215, 1.000),
                           pnr(1.225, 1.060, 0.211)], 1)


def m_semicircle():
    return rectangle(width=1.6, height=1.0, per_vertex_rounding=[R20, R20, R100, R100])


def m_oval():
    # RoundedPolygon.circle() here is the library one, i.e. with its default of 8 vertices
    return transformed(transformed(circle(), Matrix.scale(1.0, 0.64)), ROTATE_NEG_45)


def m_pill():
    return custom_polygon([pnr(0.961, 0.039, 0.426),
                           pnr(1.001, 0.428),
                           pnr(1.000, 0.609, 1.000)], reps=2, mirroring=True)


def m_triangle():
    return transformed(polygon(3, rounding=R20), ROTATE_NEG_90)


def m_diamond():
    return custom_polygon([pnr(0.500, 1.096, 0.151, 0.524),
                           pnr(0.040, 0.500, 0.159)], 2)


def m_clamshell():
    return custom_polygon([pnr(0.171, 0.841, 0.159),
                           pnr(-0.020, 0.500, 0.140),
                           pnr(0.170, 0.159, 0.159)], 2)


def m_pentagon():
    return custom_polygon([pnr(0.500, -0.009, 0.172),
                           pnr(1.030, 0.365, 0.164),
                           pnr(0.828, 0.970, 0.169)], reps=1, mirroring=True)


def m_gem():
    return custom_polygon([pnr(0.499, 1.023, 0.241, 0.778),
                           pnr(-0.005, 0.792, 0.208),
                           pnr(0.073, 0.258, 0.228),
                           pnr(0.433, -0.000, 0.491)], 1, mirroring=True)


def m_sunny():
    return star(num_vertices_per_radius=8, inner_radius=0.8, rounding=R15)


def m_very_sunny():
    return custom_polygon([pnr(0.500, 1.080, 0.085),
                           pnr(0.358, 0.843, 0.085)], 8)


def m_cookie4():
    return custom_polygon([pnr(1.237, 1.236, 0.258),
                           pnr(0.500, 0.918, 0.233)], 4)


def m_cookie6():
    return custom_polygon([pnr(0.723, 0.884, 0.394),
                           pnr(0.500, 1.099, 0.398)], 6)


def m_cookie7():
    return transformed(star(num_vertices_per_radius=7, inner_radius=0.75, rounding=R50),
                       ROTATE_NEG_90)


def m_cookie9():
    return transformed(star(num_vertices_per_radius=9, inner_radius=0.8, rounding=R50),
                       ROTATE_NEG_90)


def m_cookie12():
    return transformed(star(num_vertices_per_radius=12, inner_radius=0.8, rounding=R50),
                       ROTATE_NEG_90)


def m_ghostish():
    return custom_polygon([pnr(0.500, 0.0, 1.000),
                           pnr(1.0, 0.0, 1.000),
                           pnr(1.0, 1.140, 0.254, 0.106),
                           pnr(0.575, 0.906, 0.253)], reps=1, mirroring=True)


def m_clover4():
    return custom_polygon([pnr(0.500, 0.074),
                           pnr(0.725, -0.099, 0.476)], reps=4, mirroring=True)


def m_clover8():
    return custom_polygon([pnr(0.500, 0.036),
                           pnr(0.758, -0.101, 0.209)], reps=8)


def m_burst():
    return custom_polygon([pnr(0.500, -0.006, 0.006),
                           pnr(0.592, 0.158, 0.006)], reps=12)


def m_soft_burst():
    return custom_polygon([pnr(0.193, 0.277, 0.053),
                           pnr(0.176, 0.055, 0.053)], reps=10)


def m_boom():
    return custom_polygon([pnr(0.457, 0.296, 0.007),
                           pnr(0.500, -0.051, 0.007)], reps=15)


def m_soft_boom():
    return custom_polygon([pnr(0.733, 0.454),
                           pnr(0.839, 0.437, 0.532),
                           pnr(0.949, 0.449, 0.439, 1.000),
                           pnr(0.998, 0.478, 0.174)], reps=16, mirroring=True)


def m_flower():
    return custom_polygon([pnr(0.370, 0.187),
                           pnr(0.416, 0.049, 0.381),
                           pnr(0.479, 0.001, 0.095)], reps=8, mirroring=True)


def m_puffy():
    return transformed(custom_polygon([pnr(0.500, 0.053),
                                       pnr(0.545, -0.040, 0.405),
                                       pnr(0.670, -0.035, 0.426),
                                       pnr(0.717, 0.066, 0.574),
                                       pnr(0.722, 0.128),
                                       pnr(0.777, 0.002, 0.360),
                                       pnr(0.914, 0.149, 0.660),
                                       pnr(0.926, 0.289, 0.660),
                                       pnr(0.881, 0.346),
                                       pnr(0.940, 0.344, 0.126),
                                       pnr(1.003, 0.437, 0.255)], reps=2, mirroring=True),
                       Matrix.scale(1.0, 0.742))


def m_puffy_diamond():
    return custom_polygon([pnr(0.870, 0.130, 0.146),
                           pnr(0.818, 0.357),
                           pnr(1.000, 0.332, 0.853)], reps=4, mirroring=True)


def m_pixel_circle():
    return custom_polygon([pnr(0.500, 0.000),
                           pnr(0.704, 0.000),
                           pnr(0.704, 0.065),
                           pnr(0.843, 0.065),
                           pnr(0.843, 0.148),
                           pnr(0.926, 0.148),
                           pnr(0.926, 0.296),
                           pnr(1.000, 0.296)], reps=2, mirroring=True)


def m_pixel_triangle():
    return custom_polygon([pnr(0.110, 0.500),
                           pnr(0.113, 0.000),
                           pnr(0.287, 0.000),
                           pnr(0.287, 0.087),
                           pnr(0.421, 0.087),
                           pnr(0.421, 0.170),
                           pnr(0.560, 0.170),
                           pnr(0.560, 0.265),
                           pnr(0.674, 0.265),
                           pnr(0.675, 0.344),
                           pnr(0.789, 0.344),
                           pnr(0.789, 0.439),
                           pnr(0.888, 0.439)], reps=1, mirroring=True)


def m_bun():
    return custom_polygon([pnr(0.796, 0.500),
                           pnr(0.853, 0.518, 1.0),
                           pnr(0.992, 0.631, 1.0),
                           pnr(0.968, 1.000, 1.0)], reps=2, mirroring=True)


def m_heart():
    return custom_polygon([pnr(0.500, 0.268, 0.016),
                           pnr(0.792, -0.066, 0.958),
                           pnr(1.064, 0.276, 1.000),
                           pnr(0.501, 0.946, 0.129)], reps=1, mirroring=True)


# (json key, MaterialShapes property, builder).  Every property is `builder().normalized()`.
SHAPES = [
    ('circle', 'Circle', m_circle),
    ('square', 'Square', m_square),
    ('slanted', 'Slanted', m_slanted),
    ('arch', 'Arch', m_arch),
    ('fan', 'Fan', m_fan),
    ('arrow', 'Arrow', m_arrow),
    ('semicircle', 'SemiCircle', m_semicircle),
    ('oval', 'Oval', m_oval),
    ('pill', 'Pill', m_pill),
    ('triangle', 'Triangle', m_triangle),
    ('diamond', 'Diamond', m_diamond),
    ('clamshell', 'ClamShell', m_clamshell),
    ('pentagon', 'Pentagon', m_pentagon),
    ('gem', 'Gem', m_gem),
    ('verysunny', 'VerySunny', m_very_sunny),
    ('sunny', 'Sunny', m_sunny),
    ('cookie4', 'Cookie4Sided', m_cookie4),
    ('cookie6', 'Cookie6Sided', m_cookie6),
    ('cookie7', 'Cookie7Sided', m_cookie7),
    ('cookie9', 'Cookie9Sided', m_cookie9),
    ('cookie12', 'Cookie12Sided', m_cookie12),
    ('ghostish', 'Ghostish', m_ghostish),
    ('clover4', 'Clover4Leaf', m_clover4),
    ('clover8', 'Clover8Leaf', m_clover8),
    ('burst', 'Burst', m_burst),
    ('softburst', 'SoftBurst', m_soft_burst),
    ('boom', 'Boom', m_boom),
    ('softboom', 'SoftBoom', m_soft_boom),
    ('flower', 'Flower', m_flower),
    ('puffy', 'Puffy', m_puffy),
    ('puffydiamond', 'PuffyDiamond', m_puffy_diamond),
    ('pixelcircle', 'PixelCircle', m_pixel_circle),
    ('pixeltriangle', 'PixelTriangle', m_pixel_triangle),
    ('bun', 'Bun', m_bun),
    ('heart', 'Heart', m_heart),
]

# Names the existing skin.css still uses -> the shape they now point at.
LEGACY_ALIASES = {'cookie': 'cookie9', 'sun': 'sunny', 'star': 'burst'}


# ===========================================================================
# part 3 - outline -> N_POINTS clip-path points
# ===========================================================================
#
# Every shape is sampled to the same number of points, clockwise on screen (y down),
# starting at angle 0 (3 o'clock):
#   - if the outline is star-shaped about CENTER (each ray from CENTER crosses it exactly
#     once) the points are at equal ANGLES around CENTER, so point i of every such shape
#     lies on the same ray and CSS interpolation between them is a pure radial blend;
#   - otherwise the points are at equal ARC LENGTHS, starting at the outline point where
#     the ray at angle 0 leaves the shape.
#
# CENTER is the middle of the box normalized() fits every shape into, the same point for
# all shapes.  normalized() centres the hull of all control points, so the drawn outline
# can sit up to a couple of percent off-centre and a little inside the box (as in Google's
# library); that is kept on purpose.  Star-shapedness is tested on a dense polyline
# (SUBDIV samples per cubic) and the sample points themselves are then found on the
# exact cubics, by bisection.

def _orient_clockwise(cubics):
    """Return the cubics in clockwise-on-screen order (positive shoelace area, y down)."""
    area = 0.0
    for cub in cubics:
        px, py = cub.xy(0.0)
        for j in range(1, 33):
            x, y = cub.xy(j / 32.0)
            area += px * y - x * py
            px, py = x, y
    if area >= 0:
        return cubics, False
    return [c.reverse() for c in reversed(cubics)], True


class Outline(object):
    """A closed cubic outline plus a dense polyline of it for geometry queries."""

    def __init__(self, cubics):
        self.cubics = cubics
        self.ci = []   # cubic index of every dense sample
        self.ts = []   # curve parameter of every dense sample
        self.xs = []
        self.ys = []
        for i, cub in enumerate(cubics):
            for j in range(SUBDIV):
                t = j / SUBDIV
                x, y = cub.xy(t)
                self.ci.append(i)
                self.ts.append(t)
                self.xs.append(x)
                self.ys.append(y)
        self.n = len(self.xs)
        self.lens = [0.0]   # cumulative chord length; lens[n] is the perimeter
        for j in range(self.n):
            k = (j + 1) % self.n
            self.lens.append(self.lens[-1] + math.hypot(self.xs[k] - self.xs[j],
                                                        self.ys[k] - self.ys[j]))
        self.perimeter = self.lens[-1]
        self._polar_center = None

    def area(self):
        """Shoelace area of the dense polyline (positive when clockwise on screen)."""
        s = 0.0
        for j in range(self.n):
            k = (j + 1) % self.n
            s += self.xs[j] * self.ys[k] - self.xs[k] * self.ys[j]
        return s / 2.0

    def _xy_at(self, j, frac):
        """Exact curve point `frac` of the way from dense sample j to j+1 (by parameter)."""
        return self.cubics[self.ci[j]].xy(self.ts[j] + frac / SUBDIV)

    # -- polar view around a centre ---------------------------------------

    def polar(self, center):
        """Unwrapped polar angle of every sample about `center`.

        Returns (phi, overhang, turns).  phi has n+1 entries: the angle of the first
        sample, then every step added up, so it keeps growing past 2pi.  overhang is the
        most (in radians) the outline ever turns back, anticlockwise on screen, from the
        furthest angle it has reached so far; 0 when every ray crosses it once.  turns is
        (phi[n] - phi[0]) / 2pi: 1 when the outline winds exactly once around `center`.
        """
        if self._polar_center != center:
            cx, cy = center
            phi = [math.atan2(self.ys[0] - cy, self.xs[0] - cx)]
            reached = phi[0]
            overhang = 0.0
            for j in range(self.n):
                k = (j + 1) % self.n
                ax, ay = self.xs[j] - cx, self.ys[j] - cy
                bx, by = self.xs[k] - cx, self.ys[k] - cy
                phi.append(phi[-1] + math.atan2(ax * by - ay * bx, ax * bx + ay * by))
                reached = max(reached, phi[-1])
                overhang = max(overhang, reached - phi[-1])
            self._phi = phi
            self._overhang = overhang
            self._polar_center = center
        return self._phi, self._overhang, (self._phi[-1] - self._phi[0]) / TWO_PI

    def is_star_shaped(self, center):
        _, overhang, turns = self.polar(center)
        return overhang < 1e-9 and abs(turns - 1.0) < 1e-6

    def point_at_angle(self, center, theta):
        """The outline point on the ray from `center` at angle theta (star-shaped outlines)."""
        cx, cy = center
        phi, _, _ = self.polar(center)
        target = phi[0] + ((theta - phi[0]) % TWO_PI)
        j = min(bisect.bisect_right(phi, target) - 1, self.n - 1)
        cub = self.cubics[self.ci[j]]
        dx, dy = math.cos(theta), math.sin(theta)
        lo, hi = self.ts[j], self.ts[j] + 1.0 / SUBDIV
        for _ in range(60):   # f > 0: still before the ray (clockwise); f <= 0: past it
            mid = (lo + hi) / 2
            x, y = cub.xy(mid)
            if (x - cx) * dy - (y - cy) * dx >= 0:
                lo = mid
            else:
                hi = mid
        return cub.xy((lo + hi) / 2)

    # -- arc-length view ----------------------------------------------------

    def point_at_length(self, s):
        s %= self.perimeter
        j = min(bisect.bisect_right(self.lens, s) - 1, self.n - 1)
        seg = self.lens[j + 1] - self.lens[j]
        frac = (s - self.lens[j]) / seg if seg > 0 else 0.0
        return self._xy_at(j, frac)

    def start_length(self, center):
        """Arc-length position of the outline point nearest to angle 0 as seen from `center`.

        That is where the ray from the centre towards +x leaves the shape (the outermost
        crossing if there are several); with no crossing at all, the sample whose
        polar angle is closest to 0.
        """
        cx, cy = center
        best = None   # (x, s)
        for j in range(self.n):
            k = (j + 1) % self.n
            u0, u1 = self.ys[j] - cy, self.ys[k] - cy
            if (u0 < 0) == (u1 < 0):
                continue
            cub = self.cubics[self.ci[j]]
            lo, hi = self.ts[j], self.ts[j] + 1.0 / SUBDIV
            for _ in range(60):
                mid = (lo + hi) / 2
                if (cub.xy(mid)[1] - cy < 0) == (u0 < 0):
                    lo = mid
                else:
                    hi = mid
            x, y = cub.xy((lo + hi) / 2)
            if x > cx and (best is None or x > best[0]):
                best = (x, self.lens[j] + math.hypot(x - self.xs[j], y - self.ys[j]))
        if best is not None:
            return best[1]
        j = min(range(self.n), key=lambda i: abs(math.atan2(self.ys[i] - cy, self.xs[i] - cx)))
        return self.lens[j]


ShapeResult = namedtuple('ShapeResult', 'key name mode points area fill overhang reversed')


def sample_shape(poly, n=N_POINTS, center=CENTER):
    """Sample a normalized RoundedPolygon to n (x, y) points in percent of the box.

    Returns (mode, points, overhang_degrees, was_reversed); mode is 'angle' or 'arclen'.
    """
    cubics, was_reversed = _orient_clockwise(poly.cubics)
    outline = Outline(cubics)
    _, overhang, _ = outline.polar(center)
    if outline.is_star_shaped(center):
        mode = 'angle'
        pts = [outline.point_at_angle(center, TWO_PI * k / n) for k in range(n)]
    else:
        mode = 'arclen'
        s0 = outline.start_length(center)
        pts = [outline.point_at_length(s0 + outline.perimeter * k / n) for k in range(n)]
    pts = [(100.0 * x, 100.0 * y) for x, y in pts]
    return mode, pts, math.degrees(overhang), was_reversed


def polygon_area_pct(pts):
    """Shoelace area of the sampled polygon in percent of the 100% x 100% box."""
    s = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        s += x0 * y1 - x1 * y0
    return s / 2.0 / 100.0   # (units of %^2) / (100 * 100) * 100


def fmt(v):
    s = '%.2f' % v
    return '0.00' if s == '-0.00' else s


def to_css(pts):
    return 'polygon(' + ', '.join('%s%% %s%%' % (fmt(x), fmt(y)) for x, y in pts) + ')'


def build_all():
    """Build and sample all 35 shapes; returns an ordered list of ShapeResult."""
    results = []
    for key, name, builder in SHAPES:
        poly = builder().normalized()
        mode, pts, overhang, was_reversed = sample_shape(poly)
        results.append(ShapeResult(key, name, mode, pts, polygon_area_pct(pts),
                                   (min(x for x, _ in pts), min(y for _, y in pts),
                                    max(x for x, _ in pts), max(y for _, y in pts)),
                                   overhang, was_reversed))
    return results


def check_results(results):
    """Raise if anything is off: point count, NaN, range, orientation."""
    for r in results:
        if len(r.points) != N_POINTS:
            raise AssertionError('%s: %d points' % (r.key, len(r.points)))
        for x, y in r.points:
            if not (math.isfinite(x) and math.isfinite(y)):
                raise AssertionError('%s: non-finite coordinate' % r.key)
            if not (-1e-6 <= x <= 100 + 1e-6 and -1e-6 <= y <= 100 + 1e-6):
                raise AssertionError('%s: point (%g, %g) outside the box' % (r.key, x, y))
        if not r.area > 0:
            raise AssertionError('%s: sampled polygon is not clockwise on screen' % r.key)


def to_json_dict(results):
    """name -> polygon string, in a fixed order: the 35 names alphabetically, then the aliases.

    The aliases (cookie, sun, star: the names that skin.css had before nx22) are copies of
    other shapes; build-css.py does not repeat them in the CSS (LEGACY_SHAPES there). The
    order is fixed so that the file is byte-stable (it is not sort_keys: the aliases come
    last).
    """
    css = dict((r.key, to_css([(min(100.0, max(0.0, x)), min(100.0, max(0.0, y)))
                               for x, y in r.points])) for r in results)
    out = OrderedDict((key, css[key]) for key in sorted(css))
    for alias in sorted(LEGACY_ALIASES):
        out[alias] = css[LEGACY_ALIASES[alias]]
    return out


# ===========================================================================
# part 4 - command line
# ===========================================================================

def main(argv=None):
    ap = argparse.ArgumentParser(description='Write the Material 3 Expressive shapes as '
                                             'clip-path polygons to shapes.json.')
    ap.add_argument('--out', default=DEFAULT_OUT, help='output file (default: %(default)s)')
    args = ap.parse_args(argv)

    results = build_all()
    check_results(results)
    data = to_json_dict(results)

    print('%-14s %-7s %5s %7s   %s' % ('shape', 'mode', 'pts', 'area%', 'extent of the points, % of box'))
    for r in results:
        x0, y0, x1, y1 = [min(100.0, max(0.0, v)) for v in r.fill]   # hide float noise like -0.0
        note = ''
        if r.mode == 'arclen':
            note = '   not star-shaped about (50%%, 50%%): outline turns back by %.3f deg' % r.overhang
        if r.reversed:
            note += '   (outline was reversed)'
        print('%-14s %-7s %5d %7.2f   x %5.1f..%5.1f  y %5.1f..%5.1f%s' % (
            r.key, r.mode, len(r.points), r.area, x0, x1, y0, y1, note))

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1)   # key order is set in to_json_dict(); do not sort
        f.write('\n')
    print('wrote %s: %d keys (%d shapes + %d legacy aliases), %d bytes' % (
        args.out, len(data), len(results), len(LEGACY_ALIASES), os.path.getsize(args.out)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
