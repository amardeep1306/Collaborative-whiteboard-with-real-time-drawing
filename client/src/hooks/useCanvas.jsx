import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppContext } from "../provider/AppStates";
import useDimension from "./useDimension";
import { lockUI } from "../helper/ui";
import {
  draw,
  drawFocuse,
  cornerCursor,
  inSelectedCorner,
  drawPencil,
} from "../helper/canvas";
import {
  adjustCoordinates,
  arrowMove,
  createElement,
  deleteElement,
  duplicateElement,
  getElementById,
  getElementPosition,
  minmax,
  resizeValue,
  saveElements,
  updateElement,
  uploadElements,
} from "../helper/element";
import useKeys from "./useKeys";

export default function useCanvas() {
  const {
    selectedTool,
    setSelectedTool,
    action,
    setAction,
    elements,
    setElements,
    scale,
    onZoom,
    translate,
    setTranslate,
    scaleOffset,
    setScaleOffset,
    lockTool,
    style,
    selectedElement,
    setSelectedElement,
    undo,
    redo,
  } = useAppContext();

  const canvasRef = useRef(null);
  const keys = useKeys();
  const dimension = useDimension();
  const [isInElement, setIsInElement] = useState(false);
  const [inCorner, setInCorner] = useState(false);
  const [padding, setPadding] = useState(minmax(10 / scale, [0.5, 50]));
  const [cursor, setCursor] = useState("default");
  const [mouseAction, setMouseAction] = useState({ x: 0, y: 0 });
  const [resizeOldDementions, setResizeOldDementions] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);

  const mousePosition = ({ clientX, clientY }) => {
    clientX = (clientX - translate.x * scale + scaleOffset.x) / scale;
    clientY = (clientY - translate.y * scale + scaleOffset.y) / scale;
    return { clientX, clientY };
  };

  const handleMouseDown = (event) => {
    const { clientX, clientY } = mousePosition(event);
    lockUI(true);

    if (selectedTool === "pencil") {
      setIsDrawing(true);
      setCurrentPath([{ x: clientX, y: clientY }]);
      return;
    }

    if (inCorner) {
      setResizeOldDementions(getElementById(selectedElement.id, elements));
      setElements((prevState) => prevState);
      setMouseAction({ x: event.clientX, y: event.clientY });
      setCursor(cornerCursor(inCorner.slug));
      setAction(
        "resize-" + inCorner.slug + (event.shiftKey ? "-shiftkey" : "")
      );
      return;
    }

    if (keys.has(" ") || selectedTool == "hand" || event.button == 1) {
      setTranslate((prevState) => ({
        ...prevState,
        sx: clientX,
        sy: clientY,
      }));
      setAction("translate");
      return;
    }

    if (selectedTool == "selection") {
      const element = getElementPosition(clientX, clientY, elements);

      if (element) {
        const offsetX = clientX - element.x1;
        const offsetY = clientY - element.y1;

        if (event.altKey) {
          duplicateElement(element, setElements, setSelectedElement, 0, {
            offsetX,
            offsetY,
          });
        } else {
          setElements((prevState) => prevState);
          setMouseAction({ x: event.clientX, y: event.clientY });
          setSelectedElement({ ...element, offsetX, offsetY });
        }
        setAction("move");
      } else {
        setSelectedElement(null);
      }

      return;
    }

    setAction("draw");

    const element = createElement(
      clientX,
      clientY,
      clientX,
      clientY,
      style,
      selectedTool
    );
    setElements((prevState) => [...prevState, element]);
  };

  const handleMouseMove = (event) => {
    const { clientX, clientY } = mousePosition(event);

    if (selectedTool === "pencil" && isDrawing) {
      setCurrentPath((prev) => [...prev, { x: clientX, y: clientY }]);
      return;
    }

    if (selectedElement) {
      setInCorner(
        inSelectedCorner(
          getElementById(selectedElement.id, elements),
          clientX,
          clientY,
          padding,
          scale
        )
      );
    }

    if (getElementPosition(clientX, clientY, elements)) {
      setIsInElement(true);
    } else {
      setIsInElement(false);
    }

    if (action == "draw") {
      const { id } = elements.at(-1);
      updateElement(
        id,
        { x2: clientX, y2: clientY },
        setElements,
        elements,
        true
      );
    } else if (action == "move") {
      const { id, x1, y1, x2, y2, offsetX, offsetY } = selectedElement;

      const width = x2 - x1;
      const height = y2 - y1;

      const nx = clientX - offsetX;
      const ny = clientY - offsetY;

      updateElement(
        id,
        { x1: nx, y1: ny, x2: nx + width, y2: ny + height },
        setElements,
        elements,
        true
      );
    } else if (action == "translate") {
      const x = clientX - translate.sx;
      const y = clientY - translate.sy;

      setTranslate((prevState) => ({
        ...prevState,
        x: prevState.x + x,
        y: prevState.y + y,
      }));
    } else if (action.startsWith("resize")) {
      const resizeCorner = action.slice(7, 9);
      const resizeType = action.slice(10) || "default";
      const s_element = getElementById(selectedElement.id, elements);

      updateElement(
        s_element.id,
        resizeValue(resizeCorner, resizeType, clientX, clientY, padding, s_element, mouseAction, resizeOldDementions),
        setElements,
        elements,
        true
      );
    }
  };

  const handleMouseUp = (event) => {
    if (selectedTool === "pencil" && isDrawing) {
      if (currentPath.length > 1) {
        const pencilElement = {
          id: Date.now().toString(),
          type: "pencil",
          points: [...currentPath],
          style: { ...style },
          x1: Math.min(...currentPath.map(p => p.x)),
          y1: Math.min(...currentPath.map(p => p.y)),
          x2: Math.max(...currentPath.map(p => p.x)),
          y2: Math.max(...currentPath.map(p => p.y)),
        };
        setElements((prev) => [...prev, pencilElement]);
      }
      setIsDrawing(false);
      setCurrentPath([]);
    }

    setAction("none");
    lockUI(false);

    if (event.clientX == mouseAction.x && event.clientY == mouseAction.y) {
      setElements("prevState");
      return;
    }

    if (action == "draw") {
      const lastElement = elements.at(-1);
      const { id, x1, y1, x2, y2 } = adjustCoordinates(lastElement);
      updateElement(id, { x1, x2, y1, y2 }, setElements, elements, true);
      if (!lockTool) {
        setSelectedTool("selection");
        setSelectedElement(lastElement);
      }
    }

    if (action.startsWith("resize")) {
      const { id, x1, y1, x2, y2 } = adjustCoordinates(
        getElementById(selectedElement.id, elements)
      );
      updateElement(id, { x1, x2, y1, y2 }, setElements, elements, true);
    }
  };

  const handleWheel = (event) => {
    if (event.ctrlKey) {
      onZoom(event.deltaY * -0.01);
      return;
    }

    setTranslate((prevState) => ({
      ...prevState,
      x: prevState.x - event.deltaX,
      y: prevState.y - event.deltaY,
    }));
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const zoomPositionX = 2;
    const zoomPositionY = 2;

    const scaledWidth = canvas.width * scale;
    const scaledHeight = canvas.height * scale;

    const scaleOffsetX = (scaledWidth - canvas.width) / zoomPositionX;
    const scaleOffsetY = (scaledHeight - canvas.height) / zoomPositionY;

    setScaleOffset({ x: scaleOffsetX, y: scaleOffsetY });

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.save();

    context.translate(
      translate.x * scale - scaleOffsetX,
      translate.y * scale - scaleOffsetY
    );
    context.scale(scale, scale);

    let focusedElement = null;
    elements.forEach((element) => {
      if (element.type === "pencil") {
        drawPencil(element, context);
      } else {
        draw(element, context);
      }
      if (element.id == selectedElement?.id) focusedElement = element;
    });

    // Draw current pencil path in progress
    if (isDrawing && currentPath.length > 1) {
      context.beginPath();
      context.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        context.lineTo(currentPath[i].x, currentPath[i].y);
      }
      context.strokeStyle = style.stroke;
      context.lineWidth = style.strokeWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    }

    const pd = minmax(10 / scale, [0.5, 50]);
    if (focusedElement != null && focusedElement.type !== "pencil") {
      drawFocuse(focusedElement, context, pd, scale);
    }
    setPadding(pd);

    context.restore();
  }, [elements, selectedElement, scale, translate, dimension, currentPath, isDrawing]);

  return {
    canvasRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    dimension,
  };
}